import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import type { ChartConfiguration } from "chart.js";

const WIDTH = 800;
const HEIGHT = 600;

let _renderer: ChartJSNodeCanvas | null = null;

function getRenderer(): ChartJSNodeCanvas {
  if (!_renderer) {
    _renderer = new ChartJSNodeCanvas({
      width: WIDTH,
      height: HEIGHT,
      backgroundColour: "#ffffff",
    });
  }
  return _renderer;
}

/**
 * Render a chart as a PNG buffer from query result data.
 */
export async function renderChart(
  chartType: "bar" | "line" | "scatter" | "pie" | "doughnut",
  xColumn: string,
  yColumn: string,
  data: Record<string, unknown>[],
  options?: {
    title?: string;
    colorColumn?: string;
    width?: number;
    height?: number;
  }
): Promise<Buffer> {
  const labels = data.map((row) => String(row[xColumn] ?? ""));
  const values = data.map((row) => Number(row[yColumn]) || 0);

  // Handle color grouping
  let datasets;
  if (options?.colorColumn) {
    const groups = new Map<string, { labels: string[]; values: number[] }>();
    for (const row of data) {
      const group = String(row[options.colorColumn] ?? "Other");
      if (!groups.has(group)) {
        groups.set(group, { labels: [], values: [] });
      }
      const g = groups.get(group)!;
      g.labels.push(String(row[xColumn] ?? ""));
      g.values.push(Number(row[yColumn]) || 0);
    }

    const colors = [
      "#4e79a7",
      "#f28e2b",
      "#e15759",
      "#76b7b2",
      "#59a14f",
      "#edc948",
      "#b07aa1",
      "#ff9da7",
      "#9c755f",
      "#bab0ac",
    ];

    datasets = [...groups.entries()].map(([name, g], i) => ({
      label: name,
      data: g.values,
      backgroundColor: colors[i % colors.length],
      borderColor: colors[i % colors.length],
      borderWidth: 1,
    }));
  } else {
    datasets = [
      {
        label: yColumn,
        data: values,
        backgroundColor: "#4e79a7",
        borderColor: "#4e79a7",
        borderWidth: 1,
      },
    ];
  }

  const config: ChartConfiguration = {
    type: chartType,
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: !!options?.title,
          text: options?.title ?? "",
          font: { size: 16 },
        },
        legend: {
          display: !!options?.colorColumn || datasets.length > 1,
        },
      },
      scales:
        chartType === "pie" || chartType === "doughnut"
          ? undefined
          : {
              x: { title: { display: true, text: xColumn } },
              y: { title: { display: true, text: yColumn } },
            },
    },
  };

  const renderer = getRenderer();
  return await renderer.renderToBuffer(config);
}
