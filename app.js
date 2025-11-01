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
	isNavigating: false,
	hasReachedStart: false,
	watchId: null,
	autoCenterEnabled: true,
	startMarker: null,
	endMarker: null,
	showPreview: true,
};

// Constants
const LOOK_AHEAD_DISTANCE = 1609.34; // 1 mile in meters
const START_POINT_THRESHOLD = 50; // 50 meters to consider "reached start"
const OSRM_API = "https://router.project-osrm.org/route/v1/driving/";

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
	initializeEventListeners();
});

function initializeEventListeners() {
	const fileInput = document.getElementById("gpx-file-input");
	const centerButton = document.getElementById("center-button");
	const resetButton = document.getElementById("reset-button");
	const enableLocationBtn = document.getElementById("enable-location-btn");
	const cancelLocationBtn = document.getElementById("cancel-location-btn");
	const togglePreviewButton = document.getElementById("toggle-preview-button");

	fileInput.addEventListener("change", handleFileUpload);
	centerButton.addEventListener("click", centerMapOnUser);
	resetButton.addEventListener("click", resetApp);
	enableLocationBtn.addEventListener("click", requestLocationPermission);
	cancelLocationBtn.addEventListener("click", closeLocationModal);
	togglePreviewButton.addEventListener("click", togglePreviewRoute);
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
	const { latitude, longitude, accuracy } = position.coords;
	state.userPosition = [latitude, longitude];

	// Update or create user marker
	updateUserMarker(latitude, longitude, accuracy);

	// Center map on user if auto-center is enabled
	if (state.autoCenterEnabled) {
		state.map.setView([latitude, longitude], state.map.getZoom() || 16, {
			animate: true,
			duration: 0.5,
		});
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
			} else if (state.previewRoutePolyline) {
				state.map.removeLayer(state.previewRoutePolyline);
				state.previewRoutePolyline = null;
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
		}
	}
}

// Get Route from OSRM API
async function getOSRMRoute(start, end) {
	const url = `${OSRM_API}${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;

	try {
		const response = await fetch(url);
		const data = await response.json();

		if (data.code === "Ok" && data.routes && data.routes.length > 0) {
			const coordinates = data.routes[0].geometry.coordinates;
			// Convert [lon, lat] to [lat, lon]
			return coordinates.map((coord) => [coord[1], coord[0]]);
		}
		return null;
	} catch (error) {
		console.error("OSRM API Error:", error);
		return null;
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
	} else if (state.previewRoutePolyline) {
		state.map.removeLayer(state.previewRoutePolyline);
		state.previewRoutePolyline = null;
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
	// Remove existing visible route
	if (state.visibleRoutePolyline) {
		state.map.removeLayer(state.visibleRoutePolyline);
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
	}
}

// Display Preview Route on Map (transparent)
function displayPreviewRoute(route) {
	// Remove existing preview route
	if (state.previewRoutePolyline) {
		state.map.removeLayer(state.previewRoutePolyline);
	}

	// Add new preview route
	if (route.length > 0) {
		state.previewRoutePolyline = L.polyline(route, {
			color: "#7C3AED",
			weight: 4,
			opacity: 0.3,
			lineJoin: "round",
			lineCap: "round",
			dashArray: "8, 8",
		}).addTo(state.map);
	}
}

// Display Preview Route for Approach (transparent, blue)
function displayPreviewRouteApproach(route) {
	// Remove existing preview route
	if (state.previewRoutePolyline) {
		state.map.removeLayer(state.previewRoutePolyline);
	}

	// Add new preview route
	if (route.length > 0) {
		state.previewRoutePolyline = L.polyline(route, {
			color: "#4285F4",
			weight: 4,
			opacity: 0.3,
			lineJoin: "round",
			lineCap: "round",
			dashArray: "8, 8",
		}).addTo(state.map);
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

// Center Map on User
function centerMapOnUser() {
	if (state.userPosition) {
		state.autoCenterEnabled = true;
		state.map.setView(state.userPosition, 16, {
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
	state.isNavigating = false;
	state.hasReachedStart = false;
	state.autoCenterEnabled = true;
	state.startMarker = null;
	state.endMarker = null;

	// Reset UI
	document.getElementById("navigation-section").classList.add("hidden");
	document.getElementById("upload-section").classList.remove("hidden");
	document.getElementById("gpx-file-input").value = "";
	document.getElementById("file-info").textContent = "";
}
