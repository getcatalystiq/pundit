import { createCanvas } from "@napi-rs/canvas";
import { Chart, registerables } from "chart.js";
import type { ChartConfiguration } from "chart.js";

Chart.register(...registerables);

const WIDTH = 800;
const HEIGHT = 600;

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
  const w = options?.width ?? WIDTH;
  const h = options?.height ?? HEIGHT;
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
      animation: false,
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

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  // Chart.js expects a canvas-like object
  const chart = new Chart(ctx as unknown as CanvasRenderingContext2D, config);
  chart.draw();
  const buffer = Buffer.from(canvas.toBuffer("image/png"));
  chart.destroy();

  return buffer;
}
