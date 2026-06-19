// GPX Navigation App - Main JavaScript
document.addEventListener("DOMContentLoaded", () => {
	// App state
	const state = {
		map: null,
		userLocation: null,
		userHeading: null,
		gpxData: null,
		gpxLineString: null,
		startMarker: null,
		endMarker: null,
		userMarker: null,
		osrmRoute: null,
		pinpointMarker: null,
		pinpointRouteId: null,
		watchId: null,
		isNavigating: false,
		isRouting: false,
		autoCenter: true,
		lastCoords: null,
		lastRouteFetchTime: null,
		isPinpointMode: false,
	};

	// DOM elements
	const mapElement = document.getElementById("map");
	const statusText = document.getElementById("statusText");
	const statusBanner = document.getElementById("statusBanner");
	const uploadBtn = document.getElementById("uploadBtn");
	const centerBtn = document.getElementById("centerBtn");
	const gpxFileInput = document.getElementById("gpxFileInput");
	const modeBtn = document.getElementById("modeBtn");
	const modeLabel = document.querySelector(".mode-label");

	// Update status banner
	function updateStatus(text, className) {
		statusText.textContent = text;
		statusBanner.className = "";
		if (className) {
			statusBanner.classList.add(className);
		}
	}

	// Initialize MapLibre map
	function initMap() {
		// Default center (London)
		const defaultCenter = [-0.127758, 51.507351];

		state.map = new maplibregl.Map({
			container: "map",
			style: {
				version: 8,
				sources: {
					"osm-raster": {
						type: "raster",
						tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
						tileSize: 256,
						attribution: "© OpenStreetMap contributors",
					},
				},
				layers: [
					{
						id: "osm-layer",
						type: "raster",
						source: "osm-raster",
						minzoom: 0,
						maxzoom: 19,
					},
				],
			},
			center: defaultCenter,
			zoom: 12,
			pitch: 0,
			bearing: 0,
		});

		// Add navigation controls
		state.map.addControl(new maplibregl.NavigationControl(), "top-right");

		// When map is loaded, start geolocation
		state.map.on("load", () => {
			startGeolocation();
		});

		// Toggle auto-center when user manually pans
		state.map.on("dragstart", () => {
			state.autoCenter = false;
			centerBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
		});
	}

	// Start HTML5 Geolocation tracking
	function startGeolocation() {
		if (!navigator.geolocation) {
			updateStatus("Geolocation not supported", "error");
			return;
		}

		const options = {
			enableHighAccuracy: true,
			maximumAge: 0,
			timeout: 10000,
		};

		state.watchId = navigator.geolocation.watchPosition(
			(position) => {
				const coords = position.coords;
				state.userLocation = [coords.longitude, coords.latitude];
				state.userHeading = coords.heading;

				// Update user marker
				updateUserMarker();

				// If we have GPX data, check distance to start
				if (state.gpxData && state.gpxData.start) {
					checkDistanceToStart();
				}

				// Auto-center if enabled
				if (state.autoCenter && state.map) {
					state.map.setCenter(state.userLocation);
					if (state.userHeading !== null) {
						state.map.setBearing(state.userHeading);
						state.map.setPitch(45);
					}
				}

				// Store last coords for bearing calculation
				if (state.lastCoords) {
					// Calculate bearing if heading is null
					if (state.userHeading === null) {
						const bearing = calculateBearing(state.lastCoords, state.userLocation);
						if (bearing !== null) {
							state.userHeading = bearing;
							if (state.isNavigating && state.autoCenter) {
								state.map.setBearing(bearing);
							}
						}
					}
				}
				state.lastCoords = state.userLocation.slice();
			},
			(error) => {
				console.error("Geolocation error:", error);
				updateStatus("GPS Signal Lost", "error");
			},
			options,
		);
	}

	// Calculate bearing between two coordinates
	function calculateBearing(coord1, coord2) {
		const [lon1, lat1] = coord1;
		const [lon2, lat2] = coord2;

		const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
		const x =
			Math.cos(lat1) * Math.sin(lat2) -
			Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
		const bearing = Math.atan2(y, x) * (180 / Math.PI);
		return (bearing + 360) % 360;
	}

	// Update user location marker
	function updateUserMarker() {
		if (!state.map || !state.userLocation) return;

		// Remove existing marker
		if (state.userMarker) {
			state.userMarker.remove();
		}

		// Create new marker
		state.userMarker = new maplibregl.Marker({
			element: createUserMarkerElement(),
			anchor: "center",
		})
			.setLngLat(state.userLocation)
			.addTo(state.map);
	}

	// Create custom user marker element
	function createUserMarkerElement() {
		const el = document.createElement("div");
		el.className = "user-location";
		return el;
	}

	// Check distance from user to GPX start point
	function checkDistanceToStart() {
		if (!state.userLocation || !state.gpxData.start) return;

		const distance = haversineDistance(
			state.userLocation[1],
			state.userLocation[0],
			state.gpxData.start[1],
			state.gpxData.start[0],
		);

		if (distance > 100) {
			// More than 100 meters away - show routing
			if (!state.isRouting) {
				state.isRouting = true;
				state.isNavigating = false;
				updateStatus("Routing to Start...", "routing");
				fetchOSRMRoute();
			}
		} else {
			// Within 100 meters - start navigating
			if (!state.isNavigating) {
				state.isRouting = false;
				state.isNavigating = true;
				updateStatus("Navigating", "navigating");
				removeOSRMRoute();
				state.autoCenter = true;
			}
		}
	}

	// Calculate haversine distance between two points (in meters)
	function haversineDistance(lat1, lon1, lat2, lon2) {
		const R = 6371000; // Earth radius in meters
		const φ1 = (lat1 * Math.PI) / 180;
		const φ2 = (lat2 * Math.PI) / 180;
		const Δφ = ((lat2 - lat1) * Math.PI) / 180;
		const Δλ = ((lon2 - lon1) * Math.PI) / 180;

		const a =
			Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
			Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c;
	}

	// Fetch OSRM route from user location to GPX start
	function fetchOSRMRoute() {
		if (!state.userLocation || !state.gpxData.start) return;

		// Rate limiting: don't fetch more than once every 30 seconds
		const now = Date.now();
		if (state.lastRouteFetchTime && now - state.lastRouteFetchTime < 30000) {
			return;
		}

		const userLngLat = state.userLocation.join(",");
		const startLngLat = state.gpxData.start.join(",");

		const url = `http://router.project-osrm.org/route/v1/driving/${userLngLat};${startLngLat}?overview=full&geometries=geojson`;

		state.lastRouteFetchTime = now;
		updateStatus("Routing to Start... (fetching)", "routing");

		fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`OSRM API error: ${response.status}`);
				}
				return response.json();
			})
			.then((data) => {
				if (data.routes && data.routes.length > 0) {
					drawOSRMRoute(data.routes[0].geometry);
					updateStatus("Routing to Start... (route shown)", "routing");
				} else {
					throw new Error("No route returned from OSRM");
				}
			})
			.catch((error) => {
				console.error("OSRM routing error:", error);
				updateStatus("Routing Error (See Console)", "error");
				// Reset routing flag to allow retry after delay
				state.isRouting = false;
				state.lastRouteFetchTime = null;
			});
	}

	// Draw OSRM route on map
	function drawOSRMRoute(geometry) {
		// Remove existing route
		removeOSRMRoute();

		// Add route source and layer
		state.map.addSource("osrm-route", {
			type: "geojson",
			data: {
				type: "Feature",
				geometry: geometry,
			},
		});

		state.map.addLayer({
			id: "osrm-route",
			type: "line",
			source: "osrm-route",
			layout: {
				"line-join": "round",
				"line-cap": "round",
			},
			paint: {
				"line-color": "#2196F3",
				"line-width": 4,
				"line-dasharray": [2, 2],
				"line-opacity": 0.7,
			},
		});

		state.osrmRoute = "osrm-route";
	}

	// Remove OSRM route from map
	function removeOSRMRoute() {
		if (state.osrmRoute && state.map.getLayer(state.osrmRoute)) {
			state.map.removeLayer(state.osrmRoute);
		}
		if (state.map.getSource("osrm-route")) {
			state.map.removeSource("osrm-route");
		}
		state.osrmRoute = null;
	}

	// Parse GPX file
	function parseGPX(file) {
		const reader = new FileReader();

		reader.onload = function (e) {
			const xmlText = e.target.result;
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(xmlText, "text/xml");

			// Extract track points
			const trackPoints = xmlDoc.querySelectorAll("trkpt");
			const routePoints = xmlDoc.querySelectorAll("rtept");

			let coordinates = [];

			// Prefer track points, fall back to route points
			if (trackPoints.length > 0) {
				trackPoints.forEach((pt) => {
					const lat = parseFloat(pt.getAttribute("lat"));
					const lon = parseFloat(pt.getAttribute("lon"));
					if (!isNaN(lat) && !isNaN(lon)) {
						coordinates.push([lon, lat]);
					}
				});
			} else if (routePoints.length > 0) {
				routePoints.forEach((pt) => {
					const lat = parseFloat(pt.getAttribute("lat"));
					const lon = parseFloat(pt.getAttribute("lon"));
					if (!isNaN(lat) && !isNaN(lon)) {
						coordinates.push([lon, lat]);
					}
				});
			}

			if (coordinates.length === 0) {
				updateStatus("No valid points found in GPX", "error");
				return;
			}

			// Store GPX data
			state.gpxData = {
				coordinates: coordinates,
				start: coordinates[0],
				end: coordinates[coordinates.length - 1],
			};

			// Draw GPX line on map
			drawGPXLine();

			// Add start and end markers
			addStartEndMarkers();

			// Update status
			updateStatus("GPX loaded - " + coordinates.length + " points", "");

			// If user location exists, check distance immediately
			if (state.userLocation) {
				checkDistanceToStart();
			}
		};

		reader.onerror = function () {
			updateStatus("Error reading GPX file", "error");
		};

		reader.readAsText(file);
	}

	// Draw GPX line on map
	function drawGPXLine() {
		if (!state.gpxData || !state.map) return;

		// Remove existing line
		if (state.gpxLineString && state.map.getLayer(state.gpxLineString)) {
			state.map.removeLayer(state.gpxLineString);
		}
		if (state.map.getSource("gpx-line")) {
			state.map.removeSource("gpx-line");
		}

		// Add new line source and layer
		state.map.addSource("gpx-line", {
			type: "geojson",
			data: {
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: state.gpxData.coordinates,
				},
			},
		});

		state.map.addLayer({
			id: "gpx-line",
			type: "line",
			source: "gpx-line",
			layout: {
				"line-join": "round",
				"line-cap": "round",
			},
			paint: {
				"line-color": "#FF5722",
				"line-width": 6,
				"line-opacity": 0.8,
			},
		});

		state.gpxLineString = "gpx-line";

		// Fit bounds to GPX line
		const bounds = state.gpxData.coordinates.reduce(
			(bounds, coord) => {
				return bounds.extend(coord);
			},
			new maplibregl.LngLatBounds(
				state.gpxData.coordinates[0],
				state.gpxData.coordinates[0],
			),
		);

		state.map.fitBounds(bounds, {
			padding: 50,
			duration: 1000,
		});
	}

	// Add start and end markers
	function addStartEndMarkers() {
		if (!state.gpxData || !state.map) return;

		// Remove existing markers
		if (state.startMarker) state.startMarker.remove();
		if (state.endMarker) state.endMarker.remove();

		// Start marker
		state.startMarker = new maplibregl.Marker({
			element: createMarkerElement("start"),
			anchor: "center",
		})
			.setLngLat(state.gpxData.start)
			.addTo(state.map);

		// End marker
		state.endMarker = new maplibregl.Marker({
			element: createMarkerElement("end"),
			anchor: "center",
		})
			.setLngLat(state.gpxData.end)
			.addTo(state.map);
	}

	// Create marker element
	function createMarkerElement(type) {
		const el = document.createElement("div");
		el.className = `marker-${type}`;
		el.title = type === "start" ? "Start Point" : "End Point";
		return el;
	}

	// Switch between GPX and Pinpoint modes
	function switchMode() {
		state.isPinpointMode = !state.isPinpointMode;
		uploadBtn.style.display = state.isPinpointMode ? "none" : "flex";

		if (state.isPinpointMode) {
			// Enter Pinpoint Mode
			cleanupGPXMode();
			modeLabel.textContent = "Pinpoint Mode";
			modeBtn.title = "Switch to GPX Mode";
			modeBtn.querySelector("i").className = "fas fa-route";
			updateStatus("Pinpoint Mode - Click map to set destination", "");
			setupPinpointMapClick();
		} else {
			// Enter GPX Mode
			cleanupPinpointMode();
			modeLabel.textContent = "GPX Mode";
			modeBtn.title = "Switch to Pinpoint Mode";
			modeBtn.querySelector("i").className = "fas fa-map-pin";
			updateStatus("GPX Mode - Upload GPX file to begin", "");
		}
	}

	// Cleanup GPX mode when switching to pinpoint
	function cleanupGPXMode() {
		state.isNavigating = false;
		state.isRouting = false;
		removeOSRMRoute();
		// Keep GPX line and markers visible but disable navigation logic
	}

	// Cleanup pinpoint mode
	function cleanupPinpointMode() {
		// Remove pinpoint marker
		if (state.pinpointMarker) {
			state.pinpointMarker.remove();
			state.pinpointMarker = null;
		}
		// Remove pinpoint route
		if (state.pinpointRouteId && state.map.getLayer(state.pinpointRouteId)) {
			state.map.removeLayer(state.pinpointRouteId);
		}
		if (state.map.getSource("pinpoint-route")) {
			state.map.removeSource("pinpoint-route");
		}
		state.pinpointRouteId = null;
		state.isNavigating = false;
		state.autoCenter = true;
	}

	// Create pinpoint marker element
	function createPinpointMarkerElement() {
		const el = document.createElement("div");
		el.className = "marker-pinpoint";
		el.title = "Destination Pin";
		return el;
	}

	// Fetch OSRM route from user location to pinpoint destination
	function fetchPinpointRoute(destinationCoord) {
		if (!state.userLocation) return;

		// Rate limiting
		const now = Date.now();
		if (state.lastRouteFetchTime && now - state.lastRouteFetchTime < 30000) {
			return;
		}

		const userLngLat = state.userLocation.join(",");
		const destLngLat = destinationCoord.join(",");

		const url = `http://router.project-osrm.org/route/v1/driving/${userLngLat};${destLngLat}?overview=full&geometries=geojson`;

		state.lastRouteFetchTime = now;
		updateStatus("Navigating to Pin...", "navigating");
		state.isNavigating = true;
		state.autoCenter = true;

		fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`OSRM API error: ${response.status}`);
				}
				return response.json();
			})
			.then((data) => {
				if (data.routes && data.routes.length > 0) {
					drawPinpointRoute(data.routes[0].geometry);
				} else {
					throw new Error("No route returned from OSRM");
				}
			})
			.catch((error) => {
				console.error("OSRM routing error:", error);
				updateStatus("Routing Error (See Console)", "error");
				state.lastRouteFetchTime = null;
			});
	}

	// Draw pinpoint route on map
	function drawPinpointRoute(geometry) {
		// Remove existing pinpoint route
		if (state.pinpointRouteId && state.map.getLayer(state.pinpointRouteId)) {
			state.map.removeLayer(state.pinpointRouteId);
		}
		if (state.map.getSource("pinpoint-route")) {
			state.map.removeSource("pinpoint-route");
		}

		// Add route source and layer
		state.map.addSource("pinpoint-route", {
			type: "geojson",
			data: {
				type: "Feature",
				geometry: geometry,
			},
		});

		state.map.addLayer({
			id: "pinpoint-route",
			type: "line",
			source: "pinpoint-route",
			layout: {
				"line-join": "round",
				"line-cap": "round",
			},
			paint: {
				"line-color": "#9C27B0",
				"line-width": 5,
				"line-opacity": 0.8,
			},
		});

		state.pinpointRouteId = "pinpoint-route";
	}

	// Setup map click listener for pinpoint mode
	function setupPinpointMapClick() {
		state.map.once("click", function handlePinpointClick(e) {
			if (!state.userLocation || !state.isPinpointMode) return;

			const clickedCoord = e.lngLat.toArray();

			// Clean previous pinpoint data
			cleanupPinpointMode();

			// Add pinpoint marker
			state.pinpointMarker = new maplibregl.Marker({
				element: createPinpointMarkerElement(),
				anchor: "center",
			})
				.setLngLat(clickedCoord)
				.addTo(state.map);

			// Fetch route to clicked point
			fetchPinpointRoute(clickedCoord);

			// Re-enable click listener after this one completes
			setTimeout(() => setupPinpointMapClick(), 100);
		});
	}

	// Event Listeners
	uploadBtn.addEventListener("click", () => {
		gpxFileInput.click();
	});

	gpxFileInput.addEventListener("change", (e) => {
		const file = e.target.files[0];
		if (file && file.name.endsWith(".gpx")) {
			parseGPX(file);
		} else {
			updateStatus("Please select a valid GPX file", "error");
		}
		e.target.value = ""; // Reset input
	});

	centerBtn.addEventListener("click", () => {
		if (state.userLocation) {
			state.map.setCenter(state.userLocation);
			state.autoCenter = true;
			centerBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
		}
	});

	modeBtn.addEventListener("click", () => {
		switchMode();
	});

	// Initialize the app
	initMap();
	updateStatus("Ready - Upload GPX file to begin", "");
});
