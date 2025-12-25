"""
MCP Server Lambda Handler with Streamable HTTP Transport.

Implements MCP 2025-03-26 specification:
- Streamable HTTP transport (request/response)
- Session management via Mcp-Session-Id header
- OAuth Bearer token authentication
- JSON-RPC 2.0 protocol
"""

import base64
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from utils.config import config
from db.aurora import get_aurora_client, param
from oauth.tokens import get_token_claims
from .protocol import (
    JsonRpcRequest,
    JsonRpcResponse,
    McpError,
    PARSE_ERROR,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    INTERNAL_ERROR,
    MCP_NOT_INITIALIZED,
    MCP_INVALID_SESSION,
    create_initialize_result,
    create_tools_list,
)

logger = logging.getLogger(__name__)

# Session expiry
SESSION_EXPIRY_HOURS = 24

# Import tools after other imports to avoid circular dependency
_tools_registry: Optional[dict] = None


def _get_tools_registry() -> dict:
    """Lazy-load tools registry."""
    global _tools_registry
    if _tools_registry is None:
        from tools import TOOLS_REGISTRY
        _tools_registry = TOOLS_REGISTRY
    return _tools_registry


def handler(event: dict, context: Any) -> dict:
    """
    Lambda handler for MCP server.

    Implements Streamable HTTP transport:
    - POST /mcp - Handle JSON-RPC requests
    - GET /mcp - Server info / health check

    Headers:
    - Authorization: Bearer <token> (required)
    - Mcp-Session-Id: <session-id> (optional, returned after initialize)
    - Content-Type: application/json
    """
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    headers = event.get("headers", {})

    # Handle GET (info/health)
    if http_method == "GET":
        return _handle_get()

    # Handle POST (JSON-RPC)
    if http_method == "POST":
        return _handle_post(event, headers)

    return _error_response(405, "Method not allowed")


def _handle_get() -> dict:
    """Handle GET request - return server info."""
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "name": "pundit-mcp-server",
            "version": "0.1.0",
            "protocol": "2025-03-26",
            "transport": "streamable-http",
        }),
    }


def _handle_post(event: dict, headers: dict) -> dict:
    """Handle POST request - process JSON-RPC."""
    # Authenticate
    auth_header = headers.get("authorization") or headers.get("Authorization")
    if not auth_header:
        return _error_response(401, "Missing Authorization header")

    try:
        token_claims = get_token_claims(auth_header)
    except Exception as e:
        logger.warning(f"Auth failed: {e}")
        return _error_response(401, f"Invalid token: {e}")

    # Extract session ID
    session_id = headers.get("mcp-session-id") or headers.get("Mcp-Session-Id")

    # Parse request body
    body = event.get("body", "")
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")

    try:
        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError as e:
        return _jsonrpc_error(None, McpError(PARSE_ERROR, f"Invalid JSON: {e}"))

    try:
        request = JsonRpcRequest.from_dict(request_data)
    except McpError as e:
        return _jsonrpc_error(request_data.get("id"), e)

    # Route to method handler
    try:
        result, new_session_id = _handle_method(
            request=request,
            session_id=session_id,
            token_claims=token_claims,
        )

        response = JsonRpcResponse.success(request.id, result)
        response_headers = {"Content-Type": "application/json"}

        if new_session_id:
            response_headers["Mcp-Session-Id"] = new_session_id

        # Notifications don't get responses
        if request.is_notification:
            return {
                "statusCode": 202,
                "headers": response_headers,
                "body": "",
            }

        return {
            "statusCode": 200,
            "headers": response_headers,
            "body": json.dumps(response.to_dict()),
        }

    except McpError as e:
        logger.warning(f"MCP error: {e.code} - {e.message}")
        return _jsonrpc_error(request.id, e)
    except Exception as e:
        logger.exception(f"Internal error: {e}")
        return _jsonrpc_error(request.id, McpError(INTERNAL_ERROR, str(e)))


def _handle_method(
    request: JsonRpcRequest,
    session_id: Optional[str],
    token_claims: dict,
) -> tuple[Any, Optional[str]]:
    """
    Route JSON-RPC method to handler.

    Returns:
        Tuple of (result, new_session_id or None)
    """
    method = request.method
    params = request.params

    # Initialize - creates new session
    if method == "initialize":
        return _handle_initialize(params, token_claims)

    # Notifications (no response needed)
    if method == "notifications/initialized":
        _validate_session(session_id, token_claims)
        return {}, None

    if method == "notifications/cancelled":
        return {}, None

    # All other methods require valid session
    session = _validate_session(session_id, token_claims)

    # List tools
    if method == "tools/list":
        return _handle_tools_list(), None

    # Call tool
    if method == "tools/call":
        return _handle_tools_call(params, session, token_claims), None

    # Ping
    if method == "ping":
        return {}, None

    raise McpError(METHOD_NOT_FOUND, f"Method not found: {method}")


def _handle_initialize(params: dict, token_claims: dict) -> tuple[dict, str]:
    """Handle initialize request - create new session."""
    client_info = params.get("clientInfo", {})
    capabilities = params.get("capabilities", {})
    protocol_version = params.get("protocolVersion", "")

    # Validate protocol version
    if protocol_version and protocol_version != "2025-03-26":
        logger.info(f"Client protocol version: {protocol_version}")

    # Create session
    session_id = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_EXPIRY_HOURS)

    aurora = get_aurora_client()
    aurora.execute(
        """
        INSERT INTO mcp_sessions
            (session_id, user_id, tenant_id, client_info, capabilities, expires_at)
        VALUES
            (:session_id, :user_id::uuid, :tenant_id::uuid,
             :client_info::jsonb, :capabilities::jsonb, :expires_at::timestamptz)
        """,
        [
            param("session_id", session_id),
            param("user_id", token_claims["sub"], "UUID"),
            param("tenant_id", token_claims["tenant_id"], "UUID"),
            param("client_info", json.dumps(client_info)),
            param("capabilities", json.dumps(capabilities)),
            param("expires_at", expires_at.isoformat()),
        ]
    )

    logger.info(f"Created MCP session: {session_id} for user {token_claims['sub']}")

    return create_initialize_result(), session_id


def _validate_session(session_id: Optional[str], token_claims: dict) -> dict:
    """
    Validate session ID and return session data.

    Raises:
        McpError: If session is invalid or expired
    """
    if not session_id:
        raise McpError(MCP_NOT_INITIALIZED, "Session not initialized. Call initialize first.")

    aurora = get_aurora_client()
    session = aurora.query_one(
        """
        SELECT session_id, user_id, tenant_id, client_info, capabilities
        FROM mcp_sessions
        WHERE session_id = :session_id
          AND expires_at > NOW()
        """,
        [param("session_id", session_id)]
    )

    if not session:
        raise McpError(MCP_INVALID_SESSION, "Invalid or expired session")

    # Verify session belongs to this user
    if session["user_id"] != token_claims["sub"]:
        raise McpError(MCP_INVALID_SESSION, "Session does not belong to this user")

    # Update last activity
    aurora.execute(
        "UPDATE mcp_sessions SET last_activity_at = NOW() WHERE session_id = :session_id",
        [param("session_id", session_id)]
    )

    return session


def _handle_tools_list() -> dict:
    """Handle tools/list request."""
    tools = _get_tools_registry()

    tool_list = []
    for name, tool in tools.items():
        tool_list.append({
            "name": name,
            "description": tool["description"],
            "inputSchema": tool["input_schema"],
        })

    return create_tools_list(tool_list)


def _handle_tools_call(params: dict, session: dict, token_claims: dict) -> dict:
    """Handle tools/call request."""
    tool_name = params.get("name")
    arguments = params.get("arguments", {})

    if not tool_name:
        raise McpError(INVALID_REQUEST, "Missing tool name")

    tools = _get_tools_registry()
    if tool_name not in tools:
        raise McpError(METHOD_NOT_FOUND, f"Tool not found: {tool_name}")

    tool = tools[tool_name]

    # Check scope requirements
    required_scope = tool.get("required_scope", "read")
    user_scopes = token_claims.get("scope", "").split()
    if required_scope not in user_scopes and "admin" not in user_scopes:
        raise McpError(
            INVALID_REQUEST,
            f"Insufficient scope. Required: {required_scope}, has: {user_scopes}"
        )

    # Execute tool
    try:
        result = tool["handler"](
            arguments=arguments,
            tenant_id=token_claims["tenant_id"],
            user_id=token_claims["sub"],
        )
        return result
    except Exception as e:
        logger.exception(f"Tool execution failed: {tool_name}")
        raise McpError(INTERNAL_ERROR, f"Tool execution failed: {e}")


def _jsonrpc_error(request_id: Any, error: McpError) -> dict:
    """Create JSON-RPC error response."""
    response = JsonRpcResponse.error(request_id, error)
    return {
        "statusCode": 200,  # JSON-RPC errors still return 200
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(response.to_dict()),
    }


def _error_response(status_code: int, message: str) -> dict:
    """Create HTTP error response."""
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": message}),
    }
