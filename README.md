# NFT Hydroponic System Calculator

An interactive engineering tool for designing Nutrient Film Technique (NFT) hydroponic installations. Calculates pipe dimensions, flow rates, fittings, and generates downloadable system schematics.

## What It Does

Configure your NFT system parameters with sliders and get real-time calculations for:

- **Pipe sizing** — supply, feed, and drain pipe diameters based on total flow requirements
- **Channel dimensions** — width, depth, and slope for NFT gullies
- **Vertical layout** — level heights calculated from first-level distance to ground and inter-level spacing
- **Flow & power** — per-channel and total flow rates, pump wattage, required head, reservoir volume
- **Bill of Materials** — complete parts list with pipe lengths, tubing types, fitting quantities, and equipment specs

## Views

| View | Description |
|------|-------------|
| **Elevation** | Side cross-section showing shelves at true heights with dimension lines for first-level height, level spacing, and total installation height |
| **Plan** | Top-down layout of shelves, channels, and supply/drain routing |
| **Materials** | Full BOM tables for pipes & tubing, fittings & connectors, and equipment — exportable as CSV |

All schematic views are downloadable as SVG files.

## Input Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| Channel Length | 1–12 m | Length of each NFT channel |
| Shelf Width | 300–1200 mm | Width of each shelf unit |
| Shelves | 1–8 | Number of shelf columns |
| Levels / Shelf | 1–8 | Vertical tiers per shelf |
| Channels / Level | 1–6 | NFT channels per tier |
| 1st Level Height | 0.15–1.50 m | Distance from ground to first level |
| Level Spacing | 0.15–1.20 m | Vertical distance between levels |

## Tech Stack

- **React** with hooks
- **Vite** for build tooling
- **Inline SVG** for schematics (no external charting library)
- **Averia Sans Libre** for headings, **Atkinson Hyperlegible** for body text

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm

### Install & Run

```bash
git clone https://github.com/YOUR_USERNAME/nft-calculator.git
cd nft-calculator
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
```

Static output goes to `dist/`. Serve with any static file host.

## Deployment

This project builds to static HTML/CSS/JS and can be hosted anywhere. Tested with:

- **DigitalOcean App Platform** (free tier for static sites) — connect the GitHub repo, set build command to `npm run build`, output directory to `dist`
- **DigitalOcean Droplet** with Nginx serving the `dist/` folder
- Any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages)

## Project Structure

```
nft-calculator/
├── index.html          # Entry point with Google Fonts link
├── package.json
├── vite.config.js
└── src/
    └── App.jsx         # Entire application — calculator, SVG schematics, BOM engine
```

## License

MIT
