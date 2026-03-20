## 1. Process Map Font Contrast

- [x] 1.1 In ProcessMapView.tsx: change all SVG `<text>` fill values to `#e6edf3` (hardcoded light color)
- [x] 1.2 In BottleneckView.tsx: change all SVG `<text>` fill values to `#e6edf3`
- [x] 1.3 In ProcessMap.tsx (global process map): already uses `#e6edf3` — verified

## 2. Watcher Reads Config on Startup

- [x] 2.1 In server.ts constructor: read `~/.agentflow/dashboard-config.json`, merge `extraDirs` into `config.dataDirs` before creating TraceWatcher
- [x] 2.2 Handle missing/corrupt config file gracefully (try/catch, use CLI args only)

## 3. Process Map Zoom/Pan

- [x] 3.1 Create `src/client/hooks/useZoomPan.ts` — tracks scale + translate, handles wheel (zoom) and mousedown+mousemove (pan)
- [x] 3.2 Apply zoom/pan transform to ProcessMapView SVG via `<g transform="...">`
- [x] 3.3 Apply zoom/pan transform to BottleneckView SVG
- [x] 3.4 Add +/- zoom buttons and reset button to process map views
- [x] 3.5 Add CSS for zoom controls

## 4. Settings: Rescan + Manual Add

- [x] 4.1 Add "Rescan" button to SettingsPanel that re-triggers `GET /api/directories` to refresh discovered/suggested lists
- [x] 4.2 Add "Add directory" text input + button to SettingsPanel for manually entering a path
- [x] 4.3 Server: validate manually added paths exist before saving to config (returns 400 if not)
- [x] 4.4 Add "Remove" button (×) next to each watched directory

## 5. Sidebar Updates on Agent Switch

- [x] 5.1 In App.tsx: add `key={selectedAgent}` to ExecSidebar to force remount on agent change
- [x] 5.2 Verify: key forces React to remount sidebar with new agent's data
