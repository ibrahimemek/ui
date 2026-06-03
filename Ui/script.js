const dashboardConfig = {
  backendBaseUrl: window.location.origin,
  pollIntervalMs: 2000,
  buildingFetchIntervalMs: 20000,
  deploymentZoneSizeMeters: 15,
  deploymentZoom: 20,
  tileMaxNativeZoom: 18,
  tileMaxZoom: 22,
  tileMinZoom: 3,
  map: {
    center: [39.0, 35.0],
    zoom: 6
  },
  microphoneNodes: [
    { node_id: "ESP32-S3-01", lat: 41.0082, lng: 28.9784, battery_voltage: 4.06 },
    { node_id: "ESP32-S3-02", lat: 39.9334, lng: 32.8597, battery_voltage: 4.01 },
    { node_id: "ESP32-S3-03", lat: 38.4237, lng: 27.1428, battery_voltage: 3.99 },
    { node_id: "ESP32-S3-04", lat: 37.0, lng: 35.3213, battery_voltage: 4.03 }
  ]
};

const map = L.map("map", {
  minZoom: dashboardConfig.tileMinZoom,
  maxZoom: dashboardConfig.tileMaxZoom,
  zoomControl: true,
  wheelDebounceTime: 60
}).setView(dashboardConfig.map.center, dashboardConfig.map.zoom);

const esriWorldImagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    minZoom: dashboardConfig.tileMinZoom,
    maxZoom: dashboardConfig.tileMaxZoom,
    maxNativeZoom: dashboardConfig.tileMaxNativeZoom,
    keepBuffer: 4,
    attribution:
      "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  }
);

const openStreetMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  minZoom: dashboardConfig.tileMinZoom,
  maxZoom: dashboardConfig.tileMaxZoom,
  maxNativeZoom: dashboardConfig.tileMaxNativeZoom,
  keepBuffer: 4,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

esriWorldImagery.addTo(map);

const blueNodeIcon = L.divIcon({
  className: "custom-node-icon",
  html: `
    <svg class="mic-icon-svg" width="30" height="30" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#1d4ed8" stroke="#bfdbfe" stroke-width="2" />
      <path d="M16 9a3.6 3.6 0 0 0-3.6 3.6v4.2a3.6 3.6 0 1 0 7.2 0v-4.2A3.6 3.6 0 0 0 16 9z" fill="#eff6ff"/>
      <path d="M22 16.2a1 1 0 1 0-2 0 4 4 0 1 1-8 0 1 1 0 0 0-2 0 6 6 0 0 0 5 5.9V24h-2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-1.9a6 6 0 0 0 5-5.9z" fill="#dbeafe"/>
    </svg>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15]
});

const sourceIcon = L.divIcon({
  className: "source-marker-icon",
  html: `<span class="source-dot" aria-label="Detected source"></span>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -14]
});

const state = {
  nodeMarkers: new Map(),
  sourceMarker: null,
  tdoaLines: [],
  hasAppliedStartupBounds: false,
  deploymentCenter: null,
  deploymentBounds: null,
  lastBuildingsFetchMs: 0,
  deploymentBoundary: null,
  deploymentGridLines: []
};

const deploymentGridLayer = L.layerGroup().addTo(map);
const buildingFootprintsLayer = L.geoJSON([], {
  style: {
    color: "#f8fafc",
    weight: 1,
    opacity: 0.85,
    fillColor: "#cbd5e1",
    fillOpacity: 0.22
  }
}).addTo(map);

L.control
  .layers(
    {
      "Esri World Imagery": esriWorldImagery,
      "OpenStreetMap Mapnik": openStreetMap
    },
    {
      "OSM Building Footprints": buildingFootprintsLayer,
      "15x15m Deployment Grid": deploymentGridLayer
    },
    { collapsed: false }
  )
  .addTo(map);

function applyTileFallback(event, layer) {
  const tile = event.tile;
  const coords = event.coords;
  if (!tile || !coords) {
    return;
  }

  const attempt = Number(tile.dataset.fallbackAttempt || 0) + 1;
  tile.dataset.fallbackAttempt = String(attempt);
  if (attempt > 5) {
    return;
  }

  const baseFallbackZoom = coords.z - attempt;
  const fallbackNativeZoom = layer.options.maxNativeZoom ?? dashboardConfig.tileMaxNativeZoom;
  const fallbackZoom = Math.max(layer.options.minZoom ?? dashboardConfig.tileMinZoom, Math.min(baseFallbackZoom, fallbackNativeZoom));
  if (fallbackZoom >= coords.z) {
    return;
  }

  const scaleFactor = 2 ** (coords.z - fallbackZoom);
  const fallbackX = Math.floor(coords.x / scaleFactor);
  const fallbackY = Math.floor(coords.y / scaleFactor);
  const fallbackCoords = L.point(fallbackX, fallbackY);
  fallbackCoords.z = fallbackZoom;

  const fallbackUrl = layer.getTileUrl(fallbackCoords);
  const offsetX = coords.x % scaleFactor;
  const offsetY = coords.y % scaleFactor;
  const upscale = scaleFactor;
  const originX = (offsetX / (upscale - 1 || 1)) * 100;
  const originY = (offsetY / (upscale - 1 || 1)) * 100;

  tile.style.transformOrigin = `${originX}% ${originY}%`;
  tile.style.transform = `scale(${upscale})`;
  tile.style.imageRendering = "pixelated";
  tile.src = fallbackUrl;
}

esriWorldImagery.on("tileerror", (event) => applyTileFallback(event, esriWorldImagery));
openStreetMap.on("tileerror", (event) => applyTileFallback(event, openStreetMap));
esriWorldImagery.on("tileload", (event) => {
  event.tile.dataset.fallbackAttempt = "0";
});
openStreetMap.on("tileload", (event) => {
  event.tile.dataset.fallbackAttempt = "0";
});

function renderMicrophoneStatus(nodes) {
  const list = document.getElementById("mic-status-list");
  list.innerHTML = "";

  nodes.forEach((node) => {
    const item = document.createElement("li");
    item.className = "status-item";
    item.innerHTML = `
      <div class="node-id">${node.node_id}</div>
      <div class="coords">Lat: ${node.lat.toFixed(6)}, Lng: ${node.lng.toFixed(6)}</div>
      <div class="battery">Battery: ${node.battery_voltage.toFixed(2)} V</div>
    `;
    list.appendChild(item);
  });
}

function fitMapToNodesOnStartup(nodes) {
  if (state.hasAppliedStartupBounds || nodes.length === 0) {
    return;
  }

  const bounds = L.latLngBounds(nodes.map((node) => [node.lat, node.lng]));
  map.fitBounds(bounds, { padding: [40, 40] });
  state.hasAppliedStartupBounds = true;
}

function upsertMicrophoneNodeMarkers(nodesConfig) {
  const activeNodeIds = new Set(nodesConfig.map((node) => node.node_id));

  nodesConfig.forEach((node) => {
    const nodeLatLng = [node.lat, node.lng];
    const existingMarker = state.nodeMarkers.get(node.node_id);

    if (existingMarker) {
      existingMarker.setLatLng(nodeLatLng);
    } else {
      const marker = L.marker(nodeLatLng, { icon: blueNodeIcon, zIndexOffset: 700 }).addTo(map);
      marker.on("click", () => {
        const markerLatLng = marker.getLatLng();
        marker.bindPopup(
          `
            <strong>Node ID:</strong> ${node.node_id}<br />
            <strong>Coordinates:</strong> ${markerLatLng.lat.toFixed(6)}, ${markerLatLng.lng.toFixed(6)}
          `
        ).openPopup();
      });
      state.nodeMarkers.set(node.node_id, marker);
    }
  });

  [...state.nodeMarkers.entries()].forEach(([nodeId, marker]) => {
    if (!activeNodeIds.has(nodeId)) {
      map.removeLayer(marker);
      state.nodeMarkers.delete(nodeId);
    }
  });
}

function clearSourceVisualization() {
  if (state.sourceMarker) {
    map.removeLayer(state.sourceMarker);
    state.sourceMarker = null;
  }

  state.tdoaLines.forEach((line) => map.removeLayer(line));
  state.tdoaLines = [];
}

function updateSourceStatusText(text) {
  const sourceStatus = document.getElementById("source-status");
  sourceStatus.textContent = text;
}

function updateSourceLocation(lat, lng) {
  clearSourceVisualization();

  const sourceLatLng = [lat, lng];
  state.sourceMarker = L.marker(sourceLatLng, { icon: sourceIcon, zIndexOffset: 1200 }).addTo(map);
  state.sourceMarker.bindPopup(
    `<strong>Detected Source:</strong> X<br /><strong>Coordinates:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}`
  );

  state.nodeMarkers.forEach((nodeMarker) => {
    const line = L.polyline([nodeMarker.getLatLng(), sourceLatLng], {
      color: "#ef4444",
      weight: 2.5,
      opacity: 0.9,
      dashArray: "6, 6"
    }).addTo(map);
    state.tdoaLines.push(line);
  });

  updateSourceStatusText(`Source: Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`);
  updateVisualProminenceForZoom();
}

function metersToLatDegrees(meters) {
  return meters / 111320;
}

function metersToLngDegrees(meters, atLatitude) {
  const scale = Math.cos((atLatitude * Math.PI) / 180);
  return meters / (111320 * Math.max(scale, 0.000001));
}

function computeNodesCenter(nodes) {
  const avgLat = nodes.reduce((acc, node) => acc + node.lat, 0) / nodes.length;
  const avgLng = nodes.reduce((acc, node) => acc + node.lng, 0) / nodes.length;
  return { lat: avgLat, lng: avgLng };
}

function drawDeploymentGrid(nodes) {
  if (!nodes.length) {
    return;
  }

  deploymentGridLayer.clearLayers();
  const center = computeNodesCenter(nodes);
  state.deploymentCenter = center;

  const halfSide = dashboardConfig.deploymentZoneSizeMeters / 2;
  const latDelta = metersToLatDegrees(halfSide);
  const lngDelta = metersToLngDegrees(halfSide, center.lat);

  const north = center.lat + latDelta;
  const south = center.lat - latDelta;
  const east = center.lng + lngDelta;
  const west = center.lng - lngDelta;

  const boundary = [
    [north, west],
    [north, east],
    [south, east],
    [south, west],
    [north, west]
  ];

  state.deploymentBoundary = L.polyline(boundary, {
    color: "#22d3ee",
    weight: 2.4,
    opacity: 0.9
  }).addTo(deploymentGridLayer);

  state.deploymentGridLines = [];
  for (let meter = 0; meter <= dashboardConfig.deploymentZoneSizeMeters; meter += 1) {
    const offsetMeters = meter - halfSide;
    const lineLng = center.lng + metersToLngDegrees(offsetMeters, center.lat);
    const lineLat = center.lat + metersToLatDegrees(offsetMeters);

    state.deploymentGridLines.push(
      L.polyline(
        [
          [south, lineLng],
          [north, lineLng]
        ],
        { color: "#22d3ee", weight: 1.2, opacity: 0.36 }
      ).addTo(deploymentGridLayer)
    );

    state.deploymentGridLines.push(
      L.polyline(
        [
          [lineLat, west],
          [lineLat, east]
        ],
        { color: "#22d3ee", weight: 1.2, opacity: 0.36 }
      ).addTo(deploymentGridLayer)
    );
  }

  state.deploymentBounds = L.latLngBounds([
    [south, west],
    [north, east]
  ]);
  updateVisualProminenceForZoom();
}

function updateVisualProminenceForZoom() {
  const zoom = map.getZoom();
  const normalized = Math.max(0, Math.min(1, (zoom - 15) / 7));
  const markerScale = 1 + normalized * 0.55;
  const boundaryWeight = 2.2 + normalized * 2.8;
  const gridWeight = 0.9 + normalized * 1.1;
  const gridOpacity = 0.28 + normalized * 0.28;

  state.nodeMarkers.forEach((marker) => {
    const el = marker.getElement();
    if (el) {
      const micSvg = el.querySelector(".mic-icon-svg");
      if (micSvg) {
        micSvg.style.transformOrigin = "center center";
        micSvg.style.transform = `scale(${markerScale.toFixed(2)})`;
      }
    }
  });

  if (state.sourceMarker) {
    const sourceEl = state.sourceMarker.getElement();
    if (sourceEl) {
      const sourceDot = sourceEl.querySelector(".source-dot");
      if (sourceDot) {
        sourceDot.style.transformOrigin = "center center";
        sourceDot.style.transform = `scale(${(markerScale + 0.08).toFixed(2)})`;
      }
    }
  }

  if (state.deploymentBoundary) {
    state.deploymentBoundary.setStyle({ weight: boundaryWeight });
  }

  state.deploymentGridLines.forEach((line) => {
    line.setStyle({ weight: gridWeight, opacity: gridOpacity });
  });
}

map.on("zoomend", updateVisualProminenceForZoom);

function focusOnDeploymentZone() {
  if (!state.deploymentBounds) {
    return;
  }
  map.fitBounds(state.deploymentBounds, {
    padding: [50, 50],
    maxZoom: Math.min(dashboardConfig.deploymentZoom, dashboardConfig.tileMaxZoom)
  });
}

async function refreshBuildingFootprints(nodes) {
  if (!nodes.length) {
    return;
  }

  const now = Date.now();
  if (now - state.lastBuildingsFetchMs < dashboardConfig.buildingFetchIntervalMs) {
    return;
  }

  state.lastBuildingsFetchMs = now;
  const center = computeNodesCenter(nodes);
  const overpassQuery = `[out:json][timeout:12];(way["building"](around:120,${center.lat},${center.lng});relation["building"](around:120,${center.lat},${center.lng}););out geom;`;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `data=${encodeURIComponent(overpassQuery)}`
    });

    if (!response.ok) {
      throw new Error(`Overpass error ${response.status}`);
    }

    const data = await response.json();
    const features = data.elements
      .filter((element) => Array.isArray(element.geometry) && element.geometry.length >= 3)
      .map((element) => {
        const ring = element.geometry.map((pt) => [pt.lon, pt.lat]);
        if (ring.length > 2) {
          ring.push([ring[0][0], ring[0][1]]);
        }
        return {
          type: "Feature",
          properties: { osmid: element.id },
          geometry: {
            type: "Polygon",
            coordinates: [ring]
          }
        };
      });

    buildingFootprintsLayer.clearLayers();
    buildingFootprintsLayer.addData({
      type: "FeatureCollection",
      features
    });
  } catch (error) {
    console.warn("Building footprint overlay unavailable:", error);
  }
}

async function fetchNodes() {
  const response = await fetch(`${dashboardConfig.backendBaseUrl}/nodes`);
  if (!response.ok) {
    throw new Error(`Failed to fetch /nodes: ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.nodes || [];
}

async function fetchDetection() {
  const response = await fetch(`${dashboardConfig.backendBaseUrl}/detect`);
  if (!response.ok) {
    throw new Error(`Failed to fetch /detect: ${response.status}`);
  }
  return response.json();
}

function normalizeNodes(rawNodes) {
  return rawNodes.map((node) => ({
    node_id: node.node_id ?? node.id,
    lat: Number(node.lat),
    lng: Number(node.lng),
    battery_voltage: Number(node.battery_voltage ?? 0)
  }));
}

async function refreshMapData() {
  try {
    const [rawNodes, detection] = await Promise.all([fetchNodes(), fetchDetection()]);
    const nodes = normalizeNodes(rawNodes);

    dashboardConfig.microphoneNodes = nodes;
    upsertMicrophoneNodeMarkers(nodes);
    renderMicrophoneStatus(nodes);
    fitMapToNodesOnStartup(nodes);
    drawDeploymentGrid(nodes);
    await refreshBuildingFootprints(nodes);

    if (detection && detection.detected && typeof detection.lat === "number" && typeof detection.lng === "number") {
      updateSourceLocation(detection.lat, detection.lng);
    } else {
      clearSourceVisualization();
      updateSourceStatusText("Source: Waiting for detection...");
    }
  } catch (error) {
    console.error("Live update failed:", error);
    updateSourceStatusText("Source: Backend unavailable");
  }
}

document.getElementById("focus-site-btn").addEventListener("click", focusOnDeploymentZone);

upsertMicrophoneNodeMarkers(dashboardConfig.microphoneNodes);
renderMicrophoneStatus(dashboardConfig.microphoneNodes);
fitMapToNodesOnStartup(dashboardConfig.microphoneNodes);
drawDeploymentGrid(dashboardConfig.microphoneNodes);
refreshMapData();
setInterval(refreshMapData, dashboardConfig.pollIntervalMs);
