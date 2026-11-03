import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
} from "chart.js";
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
);
export function createPriceChart(
  canvas: HTMLCanvasElement,
  points: Array<{ amount: number; observedAt: string }>,
  reducedMotion: boolean,
  color: string,
) {
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((p) =>
        new Date(p.observedAt).toLocaleDateString("en-ZA"),
      ),
      datasets: [
        {
          data: points.map((p) => p.amount),
          borderColor: color,
          backgroundColor: color + "1a",
          fill: true,
          tension: 0,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion ? false : undefined,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => "R" + Number(c.parsed.y).toFixed(2) },
        },
      },
      scales: {
        x: { ticks: { color: "#aab4c5" }, grid: { display: false } },
        y: {
          ticks: { color: "#aab4c5", callback: (v) => "R" + v },
          beginAtZero: false,
        },
      },
    },
  });
}
