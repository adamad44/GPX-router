// Application State
const state = {
	map: null,
	userPosition: null,
	userMarker: null,
	userAccuracyCircle: null,
	gpxRoute: [],
	approachRoute: [],
	currentRoutePolyline: null,
	visibleRoutePolyline: null,
	previewRoutePolyline: null,
	visibleRouteDecorator: null,
	previewRouteDecorator: null,
	isNavigating: false,
	hasReachedStart: false,
	watchId: null,
	autoCenterEnabled: true,
	startMarker: null,
	endMarker: null,
	showPreview: true,
	previewMaps: {},
	presetRoutes: {},
	rotationMode: "route", // 'off', 'route' (direction of travel is up), 'compass' (device heading is up)
	currentHeading: 0,
	lastPosition: null,
	orientationListenerActive: false,
	deviceHeading: null,
	gpsHeading: null,
	voiceEnabled: true,
	navigationSteps: [],
	currentStepIndex: -1,
	lastAnnouncedStep: -1,
	speechSynthesis: null,
};

// Constants
const LOOK_AHEAD_DISTANCE = 1609.34; // 1 mile in meters
const START_POINT_THRESHOLD = 50; // 50 meters to consider "reached start"
const OSRM_API = "https://router.project-osrm.org/route/v1/driving/";
const USER_VIEW_OFFSET_RATIO = 0.4; // keep user marker near bottom of screen (increased from 0.28)

// Preset Routes
const PRESET_ROUTES = [
	{ id: 1, file: "Farnborough 07.0922.gpx" },
	{ id: 2, file: "Farnborough 1.0921.gpx" },
	{ id: 3, file: "Farnborough 10.0921.gpx" },
	{ id: 4, file: "Farnborough 11.0921.gpx" },
	{ id: 5, file: "Farnborough 12.0822.gpx" },
	{ id: 6, file: "Farnborough 2.1121.gpx" },
	{ id: 7, file: "Farnborough 3.0122.gpx" },
	{ id: 8, file: "Farnborough 4.0322.gpx" },
	{ id: 9, file: "Farnborough-05.2203 (1).gpx" },
	{ id: 10, file: "Farnborough-06.2402.gpx" },
	{ id: 11, file: "Farnborough-08.2402.gpx" },
	{ id: 12, file: "Farnborough-09.2310.gpx" },
];

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
	initializeEventListeners();
	loadPresetRoutes();
	initVoiceNavigation();
	preventZoom();
});

// Prevent pinch zoom and double-tap zoom on Safari/iOS
function preventZoom() {
	// Prevent double-tap zoom on iOS Safari
	let lastTouchEnd = 0;
	document.addEventListener(
		"touchend",
		(event) => {
			const now = Date.now();
			if (now - lastTouchEnd <= 300) {
				event.preventDefault();
			}
			lastTouchEnd = now;
		},
		{ passive: false }
	);

	// Prevent pinch zoom
	document.addEventListener("gesturestart", (e) => {
		e.preventDefault();
	});

	document.addEventListener("gesturechange", (e) => {
		e.preventDefault();
	});

	document.addEventListener("gestureend", (e) => {
		e.preventDefault();
	});

	// Prevent touchmove zoom (two-finger zoom)
	let initialDistance = 0;
	document.addEventListener("touchstart", (e) => {
		if (e.touches.length > 1) {
			initialDistance = Math.hypot(
				e.touches[0].pageX - e.touches[1].pageX,
				e.touches[0].pageY - e.touches[1].pageY
			);
		}
	});

	document.addEventListener(
		"touchmove",
		(e) => {
			if (e.touches.length > 1) {
				e.preventDefault();
			}
		},
		{ passive: false }
	);
}

function initializeEventListeners() {
	const fileInput = document.getElementById("gpx-file-input");
	const centerButton = document.getElementById("center-button");
	const resetButton = document.getElementById("reset-button");
	const enableLocationBtn = document.getElementById("enable-location-btn");
	const cancelLocationBtn = document.getElementById("cancel-location-btn");
	const togglePreviewButton = document.getElementById("toggle-preview-button");
	const toggleRotationButton = document.getElementById("toggle-rotation-button");
	const toggleVoiceButton = document.getElementById("toggle-voice-button");

	fileInput.addEventListener("change", handleFileUpload);
	centerButton.addEventListener("click", centerMapOnUser);
	resetButton.addEventListener("click", resetApp);
	enableLocationBtn.addEventListener("click", requestLocationPermission);
	cancelLocationBtn.addEventListener("click", closeLocationModal);
	togglePreviewButton.addEventListener("click", togglePreviewRoute);
	toggleRotationButton.addEventListener("click", toggleMapRotation);
	toggleVoiceButton.addEventListener("click", toggleVoiceNavigation);
}

// Toggle Preview Route
function togglePreviewRoute() {
	state.showPreview = !state.showPreview;

	const button = document.getElementById("toggle-preview-button");
	if (state.showPreview) {
		button.style.opacity = "1";
		button.title = "Hide route preview";
	} else {
		button.style.opacity = "0.5";
		button.title = "Show route preview";
	}

	// Update the route display
	if (state.isNavigating && state.userPosition) {
		updateNavigation();
	}
}

// Toggle Map Rotation Mode (cycles through: route-up -> compass -> off -> route-up)
function toggleMapRotation() {
	const button = document.getElementById("toggle-rotation-button");

	// Cycle through modes: route -> compass -> off -> route
	if (state.rotationMode === "route") {
		state.rotationMode = "compass";
		button.style.opacity = "1";
		button.style.filter = "hue-rotate(120deg)"; // Green tint for compass
		button.title = "Compass mode (device orientation - spins with phone)";
		enableDeviceCompass();
		applyMapRotation();
	} else if (state.rotationMode === "compass") {
		state.rotationMode = "off";
		button.style.opacity = "0.5";
		button.style.filter = "none";
		button.title = "North-up mode (map fixed, north always up)";
		disableDeviceCompass();
		if (state.map) {
			setMapBearing(0);
		}
	} else {
		state.rotationMode = "route";
		button.style.opacity = "1";
		button.style.filter = "none";
		button.title =
			"Route-up mode (route direction points up - works when stationary)";
		disableDeviceCompass();
		applyMapRotation();
	}
}

// Load Preset Routes into Grid with inline previews
async function loadPresetRoutes() {
	const routeGrid = document.getElementById("route-grid");
	if (!routeGrid) return;

	Object.values(state.previewMaps || {}).forEach((mapInstance) => {
		if (mapInstance && typeof mapInstance.remove === "function") {
			mapInstance.remove();
		}
	});

	routeGrid.innerHTML = "";
	state.presetRoutes = {};
	state.previewMaps = {};

	for (const route of PRESET_ROUTES) {
		const displayName = getRouteDisplayName(route.file);
		const routeNumber = route.id.toString().padStart(2, "0");

		const card = document.createElement("div");
		card.className = "route-card";
		card.innerHTML = `
			<div class="route-card-header">
				<span class="route-number">${routeNumber}</span>
				<div class="route-meta">
					<div class="route-title">Route ${routeNumber}</div>
					<div class="route-filename">${displayName}</div>
				</div>
			</div>
			<div class="route-preview-map" id="route-map-${route.id}"></div>
			<div class="route-card-stats">
				<div class="stat">
					<span class="stat-label">Distance</span>
					<span class="stat-value" id="route-distance-${route.id}">Loading…</span>
				</div>
				<div class="stat">
					<span class="stat-label">Points</span>
					<span class="stat-value" id="route-points-${route.id}">-</span>
				</div>
			</div>
			<button class="route-card-button" data-route-id="${route.id}">Load Route ${routeNumber}</button>
		`;

		routeGrid.appendChild(card);

		const loadButton = card.querySelector(".route-card-button");
		loadButton.disabled = true;
		loadButton.textContent = "Loading…";

		// Load route data asynchronously (don't block other cards)
		(async () => {
			try {
				const response = await fetch(`routes/${route.file}`);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const gpxText = await response.text();
				const points = parseGPX(gpxText);

				if (points.length === 0) {
					throw new Error("No route points found");
				}

				state.presetRoutes[route.id] = {
					file: route.file,
					points,
					displayName,
					routeNumber,
				};

				const totalDistance = calculateRouteDistance(points);
				document.getElementById(`route-distance-${route.id}`).textContent =
					formatDistance(totalDistance);
				document.getElementById(`route-points-${route.id}`).textContent =
					points.length;

				// Wait for DOM to be ready, then initialize map
				setTimeout(() => {
					const mapElement = document.getElementById(`route-map-${route.id}`);
					if (!mapElement) {
						console.error(`Map element not found for route ${route.id}`);
						return;
					}

					const previewMap = L.map(`route-map-${route.id}`, {
						attributionControl: false,
						zoomControl: false,
						dragging: false,
						scrollWheelZoom: false,
						doubleClickZoom: false,
						boxZoom: false,
						keyboard: false,
					});

					L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
						maxZoom: 19,
					}).addTo(previewMap);

					const polyline = L.polyline(points, {
						color: "#667eea",
						weight: 4,
						opacity: 0.9,
					}).addTo(previewMap);

					previewMap.fitBounds(polyline.getBounds(), { padding: [10, 10] });
					setTimeout(() => previewMap.invalidateSize(), 100);

					state.previewMaps[route.id] = previewMap;

					loadButton.disabled = false;
					loadButton.textContent = `Load Route ${routeNumber}`;
				}, 50);
			} catch (error) {
				console.error(`Error loading preset route ${route.file}:`, error);
				const distEl = document.getElementById(`route-distance-${route.id}`);
				const pointsEl = document.getElementById(`route-points-${route.id}`);
				if (distEl) distEl.textContent = "Error";
				if (pointsEl) pointsEl.textContent = "-";
				loadButton.disabled = true;
				loadButton.textContent = "Unavailable";
			}
		})();

		loadButton.addEventListener("click", () => loadPresetRoute(route.id));
	}
}

function getRouteDisplayName(fileName) {
	return fileName
		.replace(/\.gpx$/i, "")
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function calculateRouteDistance(points) {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		total += calculateDistance(points[i - 1], points[i]);
	}
	return total;
}

function loadPresetRoute(routeId) {
	const preset = state.presetRoutes[routeId];
	if (!preset || !preset.points || preset.points.length === 0) {
		alert("This route is unavailable. Please choose another or upload your own.");
		return;
	}

	state.gpxRoute = [...preset.points];
	state.hasReachedStart = false;
	state.approachRoute = [];

	document.getElementById(
		"file-info"
	).textContent = `✓ Route ${preset.routeNumber} loaded (${preset.points.length} points)`;

	setTimeout(() => {
		startNavigation();
	}, 200);
}

// File Upload Handler
async function handleFileUpload(event) {
	const file = event.target.files[0];
	if (!file) return;

	if (!file.name.toLowerCase().endsWith(".gpx")) {
		alert("Please upload a valid GPX file.");
		return;
	}

	try {
		const text = await file.text();
		const gpxData = parseGPX(text);

		if (gpxData.length === 0) {
			alert("No route found in GPX file.");
			return;
		}

		state.gpxRoute = gpxData;
		document.getElementById(
			"file-info"
		).textContent = `✓ ${file.name} loaded (${gpxData.length} points)`;

		setTimeout(() => {
			startNavigation();
		}, 500);
	} catch (error) {
		console.error("Error parsing GPX:", error);
		alert("Error reading GPX file. Please ensure it's a valid GPX file.");
	}
}

// Parse GPX File
function parseGPX(gpxText) {
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(gpxText, "text/xml");
	const points = [];

	// Try to get track points (trk/trkseg/trkpt)
	const trkpts = xmlDoc.getElementsByTagName("trkpt");
	if (trkpts.length > 0) {
		for (let i = 0; i < trkpts.length; i++) {
			const lat = parseFloat(trkpts[i].getAttribute("lat"));
			const lon = parseFloat(trkpts[i].getAttribute("lon"));
			if (!isNaN(lat) && !isNaN(lon)) {
				points.push([lat, lon]);
			}
		}
	}

	// If no track points, try route points (rte/rtept)
	if (points.length === 0) {
		const rtepts = xmlDoc.getElementsByTagName("rtept");
		for (let i = 0; i < rtepts.length; i++) {
			const lat = parseFloat(rtepts[i].getAttribute("lat"));
			const lon = parseFloat(rtepts[i].getAttribute("lon"));
			if (!isNaN(lat) && !isNaN(lon)) {
				points.push([lat, lon]);
			}
		}
	}

	return points;
}

// Start Navigation
function startNavigation() {
	// Switch to navigation view
	document.getElementById("upload-section").classList.add("hidden");
	document.getElementById("navigation-section").classList.remove("hidden");

	// Initialize map if not already done
	if (!state.map) {
		initializeMap();
	}

	// Add start and end markers
	addRouteMarkers();

	// Reset voice navigation state
	state.navigationSteps = [];
	state.currentStepIndex = -1;
	state.lastAnnouncedStep = -1;

	// Show location permission modal
	showLocationModal();

	state.isNavigating = true;
	updateStatusText("Waiting for location permission...");
}

// Show Location Permission Modal
function showLocationModal() {
	document.getElementById("location-modal").classList.remove("hidden");
}

// Close Location Permission Modal
function closeLocationModal() {
	document.getElementById("location-modal").classList.add("hidden");
	updateStatusText("Location access denied. Please enable to navigate.");
}

// Request Location Permission
function requestLocationPermission() {
	// Check if geolocation is supported
	if (!navigator.geolocation) {
		alert("Geolocation is not supported by your browser.");
		closeLocationModal();
		return;
	}

	// Close modal and immediately request location
	// This triggers the native browser permission popup (including iOS Safari)
	closeLocationModal();

	// Request compass access while we're still in a user gesture (iOS requirement)
	if (state.rotationMode === "compass") {
		enableDeviceCompass();
	}

	// Make a one-time position request to trigger native permission dialog
	navigator.geolocation.getCurrentPosition(
		(position) => {
			// Success - permission granted, now start continuous tracking
			console.log("Location permission granted");
			startGPSTracking();
		},
		(error) => {
			// Handle permission denial or errors
			handlePositionError(error);
		},
		{
			enableHighAccuracy: true,
			timeout: 10000,
			maximumAge: 0,
		}
	);
}

// Show message when permission is denied
function showPermissionDeniedMessage() {
	updateStatusText("Location access denied");

	// Create help message
	const statusBar = document.getElementById("status-bar");
	const helpDiv = document.createElement("div");
	helpDiv.style.cssText =
		"margin-top: 0.5rem; font-size: 0.85rem; color: #dc3545;";
	helpDiv.innerHTML = `
		<strong>How to enable location:</strong><br>
		Chrome: Click the location icon in the address bar<br>
		Safari: Settings → Privacy → Location Services
	`;

	if (!document.getElementById("location-help")) {
		helpDiv.id = "location-help";
		statusBar.appendChild(helpDiv);
	}
}

// Initialize Leaflet Map
function initializeMap() {
	state.map = L.map("map", {
		zoomControl: false,
		attributionControl: true,
		minZoom: 3,
		maxZoom: 19,
		rotate: true,
		bearing: 0,
		touchRotate: true,
		rotateControl: false,
	});

	// Add OpenStreetMap tiles
	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		attribution: "© OpenStreetMap contributors",
		maxZoom: 19,
	}).addTo(state.map);

	// Add zoom control to bottom left
	L.control
		.zoom({
			position: "bottomleft",
		})
		.addTo(state.map);

	// Set initial view to GPX route
	if (state.gpxRoute.length > 0) {
		const bounds = L.latLngBounds(state.gpxRoute);
		state.map.fitBounds(bounds, { padding: [50, 50] });
	}

	// Disable auto-center when user manually pans the map
	state.map.on("dragstart", () => {
		state.autoCenterEnabled = false;
	});
}

// Add Start and End Markers
function addRouteMarkers() {
	if (state.gpxRoute.length === 0) return;

	const startPoint = state.gpxRoute[0];
	const endPoint = state.gpxRoute[state.gpxRoute.length - 1];

	// Custom start icon (green)
	const startIcon = L.divIcon({
		className: "custom-marker",
		html: `<div style="background: #28a745; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
		iconSize: [30, 30],
		iconAnchor: [15, 30],
	});

	// Custom end icon (red)
	const endIcon = L.divIcon({
		className: "custom-marker",
		html: `<div style="background: #dc3545; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
		iconSize: [30, 30],
		iconAnchor: [15, 30],
	});

	state.startMarker = L.marker(startPoint, { icon: startIcon }).addTo(state.map);
	state.endMarker = L.marker(endPoint, { icon: endIcon }).addTo(state.map);
}

// Start GPS Tracking
function startGPSTracking() {
	if (!navigator.geolocation) {
		alert("Geolocation is not supported by your browser.");
		return;
	}

	updateStatusText("Acquiring GPS location...");

	if (state.rotationMode === "compass") {
		enableDeviceCompass();
	}
	if (state.rotationMode !== "off") {
		applyMapRotation();
	}

	state.watchId = navigator.geolocation.watchPosition(
		handlePositionUpdate,
		handlePositionError,
		{
			enableHighAccuracy: true,
			timeout: 10000,
			maximumAge: 0,
		}
	);
}

// Handle Position Update
function handlePositionUpdate(position) {
	const { latitude, longitude, accuracy, heading } = position.coords;
	state.userPosition = [latitude, longitude];

	// Calculate heading if not provided by GPS
	let calculatedHeading = heading;
	if (
		(calculatedHeading === null || calculatedHeading === undefined) &&
		state.lastPosition
	) {
		calculatedHeading = calculateBearing(state.lastPosition, [
			latitude,
			longitude,
		]);
	}

	// Update heading if we have movement
	if (
		calculatedHeading !== null &&
		calculatedHeading !== undefined &&
		!isNaN(calculatedHeading)
	) {
		state.gpsHeading = calculatedHeading;
		if (!state.orientationListenerActive || state.deviceHeading === null) {
			state.currentHeading = calculatedHeading;
		}
	}

	state.lastPosition = [latitude, longitude];

	// Update or create user marker
	updateUserMarker(latitude, longitude, accuracy);

	// Rotate map if rotation mode is enabled
	if (state.rotationMode !== "off") {
		applyMapRotation();
	}

	// Center map on user if auto-center is enabled
	if (state.autoCenterEnabled) {
		centerOnLatLngWithOffset([latitude, longitude], state.map.getZoom() || 16);
	}

	// Update navigation
	updateNavigation();
}

// Handle Position Error
function handlePositionError(error) {
	console.error("GPS Error:", error);
	let message = "Unable to get your location. ";
	switch (error.code) {
		case error.PERMISSION_DENIED:
			message = "Location access denied";
			showPermissionDeniedMessage();
			break;
		case error.POSITION_UNAVAILABLE:
			message += "Location information unavailable.";
			break;
		case error.TIMEOUT:
			message += "Location request timed out.";
			break;
	}
	updateStatusText(message);
}

// Enable Device Compass (iOS Safari requires user gesture permission)
async function enableDeviceCompass() {
	try {
		if (typeof window === "undefined") return;
		if (state.orientationListenerActive) return;

		if (
			typeof DeviceOrientationEvent !== "undefined" &&
			typeof DeviceOrientationEvent.requestPermission === "function"
		) {
			// iOS 13+ permission flow
			const perm = await DeviceOrientationEvent.requestPermission();
			if (perm !== "granted") {
				console.warn("Device orientation permission not granted");
				return;
			}
		}

		// Register listener
		window.addEventListener("deviceorientation", onDeviceOrientation, true);
		state.orientationListenerActive = true;
	} catch (e) {
		console.warn("Device orientation unavailable", e);
	}
}

function disableDeviceCompass() {
	if (state.orientationListenerActive) {
		window.removeEventListener("deviceorientation", onDeviceOrientation, true);
		state.orientationListenerActive = false;
		state.deviceHeading = null;
	}
}

function onDeviceOrientation(event) {
	if (state.rotationMode !== "compass") return;

	let headingDeg = null;
	// iOS Safari provides webkitCompassHeading (0 = North, clockwise)
	if (typeof event.webkitCompassHeading === "number") {
		headingDeg = event.webkitCompassHeading;
	} else if (typeof event.alpha === "number") {
		// Fallback estimate: alpha rotates with device; convert so 0 = North
		headingDeg = (360 - event.alpha) % 360;
	}

	if (headingDeg !== null && !isNaN(headingDeg)) {
		state.deviceHeading = headingDeg;
		state.currentHeading = headingDeg;
		console.log("Device heading:", headingDeg); // Debug log
		if (state.rotationMode === "compass") {
			applyMapRotation();
		}
	}
}

// Apply map rotation from best available source: device heading, GPS bearing, or route bearing
function applyMapRotation() {
	if (!state.map) return;
	if (state.rotationMode === "off") return;

	let heading = null;

	// Compass mode: prioritize device orientation
	if (state.rotationMode === "compass") {
		// 1) Device orientation heading (most responsive)
		if (typeof state.deviceHeading === "number" && !isNaN(state.deviceHeading)) {
			heading = state.deviceHeading;
		}

		// Fallback to GPS heading if compass unavailable
		if (
			heading === null &&
			typeof state.gpsHeading === "number" &&
			!isNaN(state.gpsHeading)
		) {
			heading = state.gpsHeading;
		}
	}

	// Route mode: use the direction of the ACTIVE navigation route (the blue line)
	if (state.rotationMode === "route" && state.userPosition) {
		let activeRoute = null;

		// Determine which route is currently being followed
		if (
			!state.hasReachedStart &&
			state.approachRoute &&
			state.approachRoute.length > 1
		) {
			// Still approaching the start - use the OSRM approach route (blue line to start)
			activeRoute = state.approachRoute;
			console.log("Route mode: Using approach route (navigating to start)");
		} else if (state.gpxRoute && state.gpxRoute.length > 1) {
			// Following the GPX route
			activeRoute = state.gpxRoute;
			console.log("Route mode: Using GPX route (following track)");
		}

		// Calculate bearing from the active navigation route
		if (activeRoute && activeRoute.length > 1) {
			const progress = findNearestPointOnRoute(state.userPosition, activeRoute);
			const startIdx = Math.max(progress.index, 0);

			// Look ahead until we have at least 50 meters of route to get stable bearing
			const MIN_LOOK_AHEAD_DISTANCE = 50; // meters
			let lookIdx = startIdx + 1;
			let accumulatedDistance = 0;

			// Accumulate distance along route until we reach minimum
			while (
				lookIdx < activeRoute.length &&
				accumulatedDistance < MIN_LOOK_AHEAD_DISTANCE
			) {
				accumulatedDistance += calculateDistance(
					activeRoute[lookIdx - 1],
					activeRoute[lookIdx]
				);
				lookIdx++;
			}

			// Use the furthest point we found (or end of route if we ran out)
			lookIdx = Math.min(lookIdx - 1, activeRoute.length - 1);

			// Only calculate bearing if we found a point far enough ahead
			if (lookIdx > startIdx) {
				heading = calculateBearing(activeRoute[startIdx], activeRoute[lookIdx]);
				console.log(
					`Route mode: Bearing to navigation destination (${Math.round(
						accumulatedDistance
					)}m ahead):`,
					heading
				);
			}
		}

		// If no route, fallback to GPS heading (direction of travel)
		if (
			heading === null &&
			typeof state.gpsHeading === "number" &&
			!isNaN(state.gpsHeading)
		) {
			heading = state.gpsHeading;
			console.log("Route mode: Fallback to GPS heading:", heading);
		}
	}

	if (heading === null || isNaN(heading)) {
		console.log("No valid heading available");
		return;
	}

	state.currentHeading = heading;

	console.log("Applying rotation:", heading); // Debug log
	// Rotate map so that heading points up (rotate map opposite direction)
	setMapBearing(-heading);
} // Set map bearing using plugin if available, else basic CSS transform fallback
function setMapBearing(angleDeg) {
	if (!state.map) return;

	console.log("setMapBearing called with:", angleDeg); // Debug log

	// First, center the map on user position before rotating
	if (state.userPosition && state.rotationMode === "compass") {
		// Center map on user position without animation before rotating
		state.map.setView(state.userPosition, state.map.getZoom(), {
			animate: false,
			duration: 0
		});
	}

	// Use the Leaflet-rotate plugin methods if available
	if (typeof state.map.setBearing === "function") {
		console.log("Using setBearing"); // Debug log
		state.map.setBearing(angleDeg);
		return;
	}

	// Alternative rotate method
	if (typeof state.map.rotateTo === "function") {
		console.log("Using rotateTo"); // Debug log
		state.map.rotateTo(angleDeg);
		return;
	}

	console.log("Using CSS fallback"); // Debug log
	// Fallback: rotate the map pane (controls inside map will rotate too)
	const pane = state.map.getPane && state.map.getPane("mapPane");
	if (pane) {
		pane.style.transformOrigin = "50% 50%";
		pane.style.transition = "transform 0.2s ease-out";
		pane.style.transform = `rotate(${angleDeg}deg)`;
	}
}

// Update User Marker
function updateUserMarker(lat, lon, accuracy) {
	// Create custom user marker icon
	const userIcon = L.divIcon({
		className: "user-marker",
		iconSize: [20, 20],
		iconAnchor: [10, 10],
	});

	if (!state.userMarker) {
		state.userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(state.map);
		state.userAccuracyCircle = L.circle([lat, lon], {
			radius: accuracy,
			className: "user-accuracy",
			interactive: false,
		}).addTo(state.map);
	} else {
		state.userMarker.setLatLng([lat, lon]);
		state.userAccuracyCircle.setLatLng([lat, lon]);
		state.userAccuracyCircle.setRadius(accuracy);
	}
}

// Update Navigation Logic
async function updateNavigation() {
	if (!state.userPosition || state.gpxRoute.length === 0) return;

	const startPoint = state.gpxRoute[0];
	const distanceToStart = calculateDistance(state.userPosition, startPoint);

	// Check if user has reached the start point
	if (!state.hasReachedStart && distanceToStart <= START_POINT_THRESHOLD) {
		state.hasReachedStart = true;
		state.approachRoute = [];
		updateStatusText("Following GPX route");
	}

	// If not at start, get route to start
	if (!state.hasReachedStart && distanceToStart > START_POINT_THRESHOLD) {
		updateStatusText(
			`Navigating to route start (${formatDistance(distanceToStart)})`
		);
		await updateApproachRoute();

		// Check for voice navigation instructions (only when approaching via OSRM route)
		checkNavigationSteps();
	} else {
		// Following GPX route
		const progress = findNearestPointOnRoute(state.userPosition, state.gpxRoute);
		const remainingDistance = calculateRemainingDistance(
			progress.index,
			state.gpxRoute
		);
		updateStatusText(`On route - ${formatDistance(remainingDistance)} remaining`);
		updateVisibleRoute(progress.index);
	}
}

// Update Approach Route to Start Point
async function updateApproachRoute() {
	if (!state.userPosition || state.gpxRoute.length === 0) return;

	const start = state.userPosition;
	const end = state.gpxRoute[0];

	try {
		const route = await getOSRMRoute(start, end);
		if (route && route.length > 0) {
			state.approachRoute = route;

			// Combine approach route with GPX route for seamless transition
			const combinedRoute = [...state.approachRoute, ...state.gpxRoute];

			// Show look-ahead portion (1 mile)
			const visibleRoute = getLookAheadRoute(combinedRoute, 0);
			const previewRoute = getPreviewRoute(combinedRoute, 0);

			displayRoute(visibleRoute, "#4285F4", 0.8, 6);

			// Display preview if enabled
			if (state.showPreview && previewRoute.length > 0) {
				displayPreviewRouteApproach(previewRoute);
			} else {
				// Remove preview route and its decorator when hidden
				if (state.previewRoutePolyline) {
					state.map.removeLayer(state.previewRoutePolyline);
					state.previewRoutePolyline = null;
				}
				if (state.previewRouteDecorator) {
					state.map.removeLayer(state.previewRouteDecorator);
					state.previewRouteDecorator = null;
				}
			}
		}
	} catch (error) {
		console.error("Error getting approach route:", error);
		// Fallback: draw straight line to start
		const combinedRoute = [state.userPosition, ...state.gpxRoute];
		const visibleRoute = getLookAheadRoute(combinedRoute, 0);
		const previewRoute = getPreviewRoute(combinedRoute, 0);

		displayRoute(visibleRoute, "#4285F4", 0.8, 6);

		if (state.showPreview && previewRoute.length > 0) {
			displayPreviewRouteApproach(previewRoute);
		} else {
			// Remove preview route and its decorator when hidden
			if (state.previewRoutePolyline) {
				state.map.removeLayer(state.previewRoutePolyline);
				state.previewRoutePolyline = null;
			}
			if (state.previewRouteDecorator) {
				state.map.removeLayer(state.previewRouteDecorator);
				state.previewRouteDecorator = null;
			}
		}
	}
}

// Get Route from OSRM API
async function getOSRMRoute(start, end) {
	const url = `${OSRM_API}${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true&annotations=true`;

	try {
		const response = await fetch(url);
		const data = await response.json();

		if (data.code === "Ok" && data.routes && data.routes.length > 0) {
			const route = data.routes[0];
			const coordinates = route.geometry.coordinates;

			// Extract navigation steps for voice guidance
			if (route.legs && route.legs.length > 0) {
				state.navigationSteps = [];
				route.legs.forEach((leg) => {
					if (leg.steps) {
						leg.steps.forEach((step) => {
							if (
								step.maneuver &&
								step.maneuver.type !== "depart" &&
								step.maneuver.type !== "arrive"
							) {
								state.navigationSteps.push({
									location: [step.maneuver.location[1], step.maneuver.location[0]],
									instruction:
										step.maneuver.instruction || getManeuverInstruction(step.maneuver),
									distance: step.distance,
									type: step.maneuver.type,
									modifier: step.maneuver.modifier,
								});
							}
						});
					}
				});
				console.log("Navigation steps loaded:", state.navigationSteps.length);
			}

			// Convert [lon, lat] to [lat, lon]
			return coordinates.map((coord) => [coord[1], coord[0]]);
		}
		return null;
	} catch (error) {
		console.error("OSRM API Error:", error);
		return null;
	}
}

// Generate instruction text from maneuver data
function getManeuverInstruction(maneuver) {
	const type = maneuver.type;
	const modifier = maneuver.modifier;

	const directions = {
		turn: "Turn",
		"new name": "Continue onto",
		notification: "Continue",
		merge: "Merge",
		"on ramp": "Take the ramp",
		"off ramp": "Take the exit",
		fork: "At the fork,",
		"end of road": "At the end of the road,",
		continue: "Continue",
		roundabout: "Enter the roundabout",
		rotary: "Enter the rotary",
		"roundabout turn": "At the roundabout, take exit",
	};

	const modifiers = {
		uturn: "make a U-turn",
		"sharp right": "turn sharp right",
		right: "turn right",
		"slight right": "turn slight right",
		straight: "continue straight",
		"slight left": "turn slight left",
		left: "turn left",
		"sharp left": "turn sharp left",
	};

	let instruction = directions[type] || "Continue";
	if (modifier && modifiers[modifier]) {
		instruction += " " + modifiers[modifier];
	}

	return instruction;
}

// Voice Navigation Functions
function initVoiceNavigation() {
	if ("speechSynthesis" in window) {
		state.speechSynthesis = window.speechSynthesis;
		console.log("Voice navigation initialized");
	} else {
		console.warn("Speech synthesis not supported");
		state.voiceEnabled = false;
	}
}

function speak(text) {
	if (!state.voiceEnabled || !state.speechSynthesis) return;

	// Cancel any ongoing speech
	state.speechSynthesis.cancel();

	const utterance = new SpeechSynthesisUtterance(text);
	utterance.rate = 0.9;
	utterance.pitch = 1.0;
	utterance.volume = 1.0;

	console.log("Speaking:", text);
	state.speechSynthesis.speak(utterance);
}

function checkNavigationSteps() {
	if (
		!state.voiceEnabled ||
		!state.userPosition ||
		state.navigationSteps.length === 0
	) {
		return;
	}

	const ANNOUNCEMENT_DISTANCE = 100; // Announce 100 meters before turn

	for (let i = 0; i < state.navigationSteps.length; i++) {
		if (i <= state.lastAnnouncedStep) continue;

		const step = state.navigationSteps[i];
		const distance = calculateDistance(state.userPosition, step.location);

		// Announce when within range
		if (distance <= ANNOUNCEMENT_DISTANCE && distance > 20) {
			const distanceText =
				distance > 50 ? `In ${Math.round(distance)} meters` : "Soon";

			speak(`${distanceText}, ${step.instruction}`);
			state.lastAnnouncedStep = i;
			break;
		}
	}
}

function toggleVoiceNavigation() {
	state.voiceEnabled = !state.voiceEnabled;

	const button = document.getElementById("toggle-voice-button");
	if (button) {
		button.style.opacity = state.voiceEnabled ? "1" : "0.5";
		button.title = state.voiceEnabled ? "Voice enabled" : "Voice disabled";
	}

	if (state.voiceEnabled) {
		speak("Voice navigation enabled");
	}
}

// Update Visible Route (Look-ahead)
function updateVisibleRoute(startIndex) {
	const visibleRoute = getLookAheadRoute(state.gpxRoute, startIndex);
	const previewRoute = getPreviewRoute(state.gpxRoute, startIndex);

	// Display main route (1 mile ahead)
	displayRoute(visibleRoute, "#7C3AED", 0.8, 6);

	// Display preview route (rest of route, transparent)
	if (state.showPreview && previewRoute.length > 0) {
		displayPreviewRoute(previewRoute);
	} else {
		// Remove preview route and its decorator when hidden
		if (state.previewRoutePolyline) {
			state.map.removeLayer(state.previewRoutePolyline);
			state.previewRoutePolyline = null;
		}
		if (state.previewRouteDecorator) {
			state.map.removeLayer(state.previewRouteDecorator);
			state.previewRouteDecorator = null;
		}
	}
}

// Get Preview Route (everything after 1 mile)
function getPreviewRoute(route, startIndex) {
	if (route.length === 0) return [];

	const result = [];
	let totalDistance = 0;
	let foundStartOfPreview = false;

	for (let i = startIndex + 1; i < route.length; i++) {
		const segmentDistance = calculateDistance(route[i - 1], route[i]);
		totalDistance += segmentDistance;

		// Once we've passed the look-ahead distance, start collecting preview points
		if (totalDistance >= LOOK_AHEAD_DISTANCE) {
			if (!foundStartOfPreview) {
				// Add the last point of look-ahead route for continuity
				result.push(route[i - 1]);
				foundStartOfPreview = true;
			}
			result.push(route[i]);
		}
	}

	return result;
}

// Get Look-ahead Route Segment
function getLookAheadRoute(route, startIndex) {
	if (route.length === 0) return [];

	const result = [route[startIndex]];
	let totalDistance = 0;

	for (let i = startIndex + 1; i < route.length; i++) {
		const segmentDistance = calculateDistance(route[i - 1], route[i]);
		totalDistance += segmentDistance;
		result.push(route[i]);

		if (totalDistance >= LOOK_AHEAD_DISTANCE) {
			break;
		}
	}

	return result;
}

// Display Route on Map
function displayRoute(route, color, opacity = 0.8, weight = 6) {
	// Remove existing visible route and decorator
	if (state.visibleRoutePolyline) {
		state.map.removeLayer(state.visibleRoutePolyline);
	}
	if (state.visibleRouteDecorator) {
		state.map.removeLayer(state.visibleRouteDecorator);
	}

	// Add new route
	if (route.length > 0) {
		state.visibleRoutePolyline = L.polyline(route, {
			color: color,
			weight: weight,
			opacity: opacity,
			lineJoin: "round",
			lineCap: "round",
		}).addTo(state.map);

		// Add directional arrows to the route
		state.visibleRouteDecorator = L.polylineDecorator(
			state.visibleRoutePolyline,
			{
				patterns: [
					{
						offset: 50,
						repeat: 100,
						symbol: L.Symbol.arrowHead({
							pixelSize: 12,
							polygon: false,
							pathOptions: {
								color: color,
								weight: 3,
								opacity: opacity,
								stroke: true,
							},
						}),
					},
				],
			}
		).addTo(state.map);
	}
}

// Display Preview Route on Map (transparent)
function displayPreviewRoute(route) {
	// Remove existing preview route and decorator
	if (state.previewRoutePolyline) {
		state.map.removeLayer(state.previewRoutePolyline);
	}
	if (state.previewRouteDecorator) {
		state.map.removeLayer(state.previewRouteDecorator);
	}

	// Add new preview route
	if (route.length > 0) {
		state.previewRoutePolyline = L.polyline(route, {
			color: "#7C3AED",
			weight: 6,
			opacity: 0.8,
			lineJoin: "round",
			lineCap: "round",
		}).addTo(state.map);

		// Add directional arrows to the preview route
		state.previewRouteDecorator = L.polylineDecorator(
			state.previewRoutePolyline,
			{
				patterns: [
					{
						offset: 50,
						repeat: 100,
						symbol: L.Symbol.arrowHead({
							pixelSize: 12,
							polygon: false,
							pathOptions: {
								color: "#7C3AED",
								weight: 3,
								opacity: 0.8,
								stroke: true,
							},
						}),
					},
				],
			}
		).addTo(state.map);
	}
}

// Display Preview Route for Approach (solid, blue)
function displayPreviewRouteApproach(route) {
	// Remove existing preview route and decorator
	if (state.previewRoutePolyline) {
		state.map.removeLayer(state.previewRoutePolyline);
	}
	if (state.previewRouteDecorator) {
		state.map.removeLayer(state.previewRouteDecorator);
	}

	// Add new preview route
	if (route.length > 0) {
		state.previewRoutePolyline = L.polyline(route, {
			color: "#4285F4",
			weight: 6,
			opacity: 0.8,
			lineJoin: "round",
			lineCap: "round",
		}).addTo(state.map);

		// Add directional arrows to the approach route
		state.previewRouteDecorator = L.polylineDecorator(
			state.previewRoutePolyline,
			{
				patterns: [
					{
						offset: 50,
						repeat: 100,
						symbol: L.Symbol.arrowHead({
							pixelSize: 12,
							polygon: false,
							pathOptions: {
								color: "#4285F4",
								weight: 3,
								opacity: 0.8,
								stroke: true,
							},
						}),
					},
				],
			}
		).addTo(state.map);
	}
}

// Find Nearest Point on Route
function findNearestPointOnRoute(position, route) {
	let minDistance = Infinity;
	let nearestIndex = 0;

	for (let i = 0; i < route.length; i++) {
		const distance = calculateDistance(position, route[i]);
		if (distance < minDistance) {
			minDistance = distance;
			nearestIndex = i;
		}
	}

	return { index: nearestIndex, distance: minDistance };
}

// Calculate Distance Between Two Points (Haversine)
function calculateDistance(point1, point2) {
	const R = 6371e3; // Earth's radius in meters
	const φ1 = (point1[0] * Math.PI) / 180;
	const φ2 = (point2[0] * Math.PI) / 180;
	const Δφ = ((point2[0] - point1[0]) * Math.PI) / 180;
	const Δλ = ((point2[1] - point1[1]) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

// Calculate Bearing between two points (for heading calculation)
function calculateBearing(point1, point2) {
	const lat1 = (point1[0] * Math.PI) / 180;
	const lat2 = (point2[0] * Math.PI) / 180;
	const lon1 = (point1[1] * Math.PI) / 180;
	const lon2 = (point2[1] * Math.PI) / 180;

	const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
	const x =
		Math.cos(lat1) * Math.sin(lat2) -
		Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
	const bearing = Math.atan2(y, x);

	// Convert from radians to degrees and normalize to 0-360
	return ((bearing * 180) / Math.PI + 360) % 360;
}

// Calculate Remaining Distance on Route
function calculateRemainingDistance(startIndex, route) {
	let totalDistance = 0;
	for (let i = startIndex + 1; i < route.length; i++) {
		totalDistance += calculateDistance(route[i - 1], route[i]);
	}
	return totalDistance;
}

// Format Distance for Display
function formatDistance(meters) {
	if (meters < 1000) {
		return `${Math.round(meters)}m`;
	} else {
		return `${(meters / 1000).toFixed(1)}km`;
	}
}

// Update Status Text
function updateStatusText(text) {
	document.getElementById("status-text").textContent = text;
}

// Center map on a lat/lng with vertical offset so the user sees more ahead
function centerOnLatLngWithOffset(latlng, zoom, animationOptions = {}) {
	if (!state.map || !latlng) return;
	const map = state.map;
	const targetZoom = zoom ?? map.getZoom() ?? 16;
	const mapSize = map.getSize();
	const offsetY = mapSize.y * USER_VIEW_OFFSET_RATIO;
	
	// Project the GPS position to pixel coordinates
	const projected = map.project(latlng, targetZoom);
	
	// Keep the original X coordinate but offset the Y coordinate
	const offsetPoint = L.point(projected.x, projected.y - offsetY);
	const centerLatLng = map.unproject(offsetPoint, targetZoom);
	
	map.setView(centerLatLng, targetZoom, {
		animate: true,
		duration: 0.5,
		easeLinearity: 0.2,
		...animationOptions,
	});
}

// Center Map on User
function centerMapOnUser() {
	if (state.userPosition) {
		state.autoCenterEnabled = true;
		// Use zoom level 17 for car navigation - appropriate for seeing road details
		centerOnLatLngWithOffset(state.userPosition, 17, {
			animate: true,
			duration: 0.5,
		});
	}
}

// Reset Application
function resetApp() {
	// Stop GPS tracking
	if (state.watchId) {
		navigator.geolocation.clearWatch(state.watchId);
		state.watchId = null;
	}

	// Stop device orientation listener and reset rotation
	disableDeviceCompass();
	if (state.map) {
		setMapBearing(0);
	}

	// Clear map
	if (state.map) {
		state.map.remove();
		state.map = null;
	}

	// Reset state
	state.userPosition = null;
	state.userMarker = null;
	state.userAccuracyCircle = null;
	state.gpxRoute = [];
	state.approachRoute = [];
	state.currentRoutePolyline = null;
	state.visibleRoutePolyline = null;
	state.visibleRouteDecorator = null;
	state.previewRouteDecorator = null;
	state.isNavigating = false;
	state.hasReachedStart = false;
	state.autoCenterEnabled = true;
	state.startMarker = null;
	state.endMarker = null;
	state.deviceHeading = null;
	state.gpsHeading = null;
	state.currentHeading = 0;
	state.lastPosition = null;

	// Reset UI
	document.getElementById("navigation-section").classList.add("hidden");
	document.getElementById("upload-section").classList.remove("hidden");
	document.getElementById("gpx-file-input").value = "";
	document.getElementById("file-info").textContent = "";

	loadPresetRoutes();
}
