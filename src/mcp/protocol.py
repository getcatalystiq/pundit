"""MCP JSON-RPC protocol types and utilities."""

import json
from dataclasses import dataclass, field
from typing import Any, Optional, Union


class McpError(Exception):
    """MCP protocol error."""

    def __init__(self, code: int, message: str, data: Any = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)

    def to_dict(self) -> dict:
        """Convert to JSON-RPC error object."""
        error = {"code": self.code, "message": self.message}
        if self.data is not None:
            error["data"] = self.data
        return error


# Standard JSON-RPC error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

# MCP-specific error codes
MCP_NOT_INITIALIZED = -32000
MCP_ALREADY_INITIALIZED = -32001
MCP_INVALID_SESSION = -32002


@dataclass
class JsonRpcRequest:
    """JSON-RPC 2.0 request."""

    method: str
    params: dict = field(default_factory=dict)
    id: Optional[Union[str, int]] = None
    jsonrpc: str = "2.0"

    @classmethod
    def from_dict(cls, data: dict) -> "JsonRpcRequest":
        """Parse from dict."""
        if data.get("jsonrpc") != "2.0":
            raise McpError(INVALID_REQUEST, "Invalid JSON-RPC version")

        method = data.get("method")
        if not method:
            raise McpError(INVALID_REQUEST, "Missing method")

        return cls(
            method=method,
            params=data.get("params", {}),
            id=data.get("id"),
            jsonrpc="2.0",
        )

    @property
    def is_notification(self) -> bool:
        """Check if this is a notification (no id)."""
        return self.id is None


@dataclass
class JsonRpcResponse:
    """JSON-RPC 2.0 response."""

    id: Optional[Union[str, int]]
    result: Optional[Any] = None
    error: Optional[dict] = None
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict:
        """Convert to dict for JSON serialization."""
        response = {"jsonrpc": self.jsonrpc, "id": self.id}
        if self.error is not None:
            response["error"] = self.error
        else:
            response["result"] = self.result
        return response

    @classmethod
    def success(cls, id: Optional[Union[str, int]], result: Any) -> "JsonRpcResponse":
        """Create success response."""
        return cls(id=id, result=result)

    @classmethod
    def error(cls, id: Optional[Union[str, int]], error: McpError) -> "JsonRpcResponse":
        """Create error response."""
        return cls(id=id, error=error.to_dict())


# MCP Protocol Version
MCP_PROTOCOL_VERSION = "2025-03-26"

# Server capabilities
SERVER_CAPABILITIES = {
    "tools": {
        "listChanged": False,  # We don't support dynamic tool changes
    },
}

# Server info
SERVER_INFO = {
    "name": "pundit-mcp-server",
    "version": "0.1.0",
}

# Server instructions for the LLM
SERVER_INSTRUCTIONS = """You are connected to a database assistant that learns and improves over time.

## Learning from conversations

ALWAYS save knowledge to help future queries:

1. **Save business context** (save_business_context) when the user:
   - Explains terminology ("An active user means logged in within 30 days")
   - Describes business rules ("Revenue excludes refunds")
   - Clarifies data meanings ("Status 1=active, 2=inactive, 3=deleted")
   - Corrects your understanding ("No, that column represents monthly not daily")
   - Explains metric calculations ("Churn rate = users lost / total users at start")
   - Describes relationships ("Each order belongs to exactly one customer")

2. **Save SQL patterns** (save_sql_pattern) after execute_sql returns correct results that the user accepts.

## Workflow

1. search_database_context - Find relevant schemas, docs, examples
2. generate_sql - Create query using context
3. execute_sql - Run the query
4. save_sql_pattern - Save if results are correct
5. save_business_context - Save any domain knowledge learned

Be proactive about saving. If you learn something, save it immediately."""


def create_initialize_result() -> dict:
    """Create response for initialize request."""
    return {
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": SERVER_CAPABILITIES,
        "serverInfo": SERVER_INFO,
        "instructions": SERVER_INSTRUCTIONS,
    }


def create_tools_list(tools: list[dict]) -> dict:
    """Create response for tools/list request."""
    return {"tools": tools}


def create_tool_result(
    content: list[dict],
    is_error: bool = False,
) -> dict:
    """Create response for tools/call request."""
    result = {"content": content}
    if is_error:
        result["isError"] = True
    return result


def text_content(text: str) -> dict:
    """Create text content block."""
    return {"type": "text", "text": text}


def image_content(data: str, mime_type: str = "image/png") -> dict:
    """Create image content block (base64 encoded)."""
    return {"type": "image", "data": data, "mimeType": mime_type}


def embedded_resource(uri: str, mime_type: str, text: Optional[str] = None) -> dict:
    """Create embedded resource content block."""
    resource = {
        "type": "resource",
        "resource": {
            "uri": uri,
            "mimeType": mime_type,
        },
    }
    if text is not None:
        resource["resource"]["text"] = text
    return resource
