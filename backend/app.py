from __future__ import annotations

import os
import random
from pathlib import Path
from typing import Dict, List

from flask import Flask, jsonify, send_from_directory

app = Flask(__name__)

# Ui/ — index.html, script.js, styles.css (backend/ bir üst klasör)
STATIC_ROOT = Path(__file__).resolve().parent.parent


# Replace this store with live telemetry from Boardoza GP-02 GNSS and battery ADC reads.
NODE_STORE: List[Dict[str, float | str]] = [
    {"node_id": "ESP32-S3-01", "lat": 41.0082, "lng": 32.8600, "battery_voltage": 4.08},
    {"node_id": "ESP32-S3-02", "lat": 41.0069, "lng": 32.8597, "battery_voltage": 4.03},
    {"node_id": "ESP32-S3-03", "lat": 41.0090, "lng": 32.8400, "battery_voltage": 4.00},
    {"node_id": "ESP32-S3-04", "lat": 41.0085, "lng": 32.8535, "battery_voltage": 4.06},
]

_detection_tick = 0


def read_gnss_nodes() -> List[Dict[str, float | str]]:
    """
    Return latest GPS coordinates from the 4 microphone nodes.
    On Jetson Nano, replace this function with serial reads from GP-02 modules.
    """
    # Simulated live jitter for demo/testing. Replace with real serial GNSS + battery telemetry.
    nodes = []
    for node in NODE_STORE:
        nodes.append(
            {
                "node_id": str(node["node_id"]),
                "lat": float(node["lat"]) + random.uniform(-0.000008, 0.000008),
                "lng": float(node["lng"]) + random.uniform(-0.000008, 0.000008),
                "battery_voltage": max(3.2, float(node["battery_voltage"]) + random.uniform(-0.01, 0.01)),
            }
        )
    return nodes


def calculate_source_position(nodes: List[Dict[str, float | str]]) -> Dict[str, float | bool]:
    """
    Placeholder source calculation.
    Replace with your TDOA solver output.
    """
    global _detection_tick
    _detection_tick += 1

    if _detection_tick % 8 == 0:
        return {"detected": False}

    avg_lat = sum(float(node["lat"]) for node in nodes) / len(nodes)
    avg_lng = sum(float(node["lng"]) for node in nodes) / len(nodes)

    return {
        "detected": True,
        "lat": avg_lat,
        "lng": avg_lng,
    }


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.get("/nodes")
def get_nodes():
    nodes = read_gnss_nodes()
    return jsonify(nodes)


@app.get("/detect")
def get_detection():
    nodes = read_gnss_nodes()
    source = calculate_source_position(nodes)
    return jsonify(source)


@app.get("/")
def index():
    return send_from_directory(STATIC_ROOT, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    allowed = {"index.html", "script.js", "styles.css"}
    if filename not in allowed:
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(STATIC_ROOT, filename)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)

    
