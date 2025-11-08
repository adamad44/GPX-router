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
	routeLockedIn: false, // User has confirmed they want to start the route (one-way mode)
	watchId: null,
	autoCenterEnabled: true,
	startMarker: null,
	endMarker: null,
	showPreview: true,
	previewMaps: {},
	presetRoutes: {},
	rotationMode: "route", // 'off', 'route' (direction of travel is up), 'compass' (device heading is up)
	currentHeading: 0,
	lastBearing: 0, // For stable rotation
	smoothedHeading: 0, // Smoothed heading for rotation
	lastPosition: null,
	orientationListenerActive: false,
	deviceHeading: null,
	gpsHeading: null,
	compassEventCount: 0,
	voiceEnabled: false,
	voiceSteps: [],
	currentVoiceStepIndex: 0,
	announcedSteps: new Set(),
	lastVoiceCheckPosition: null,
	selectedTestCentre: null,
	currentView: "centre-selection", // 'centre-selection', 'route-selection', 'navigation'
	previewMap: null,
	selectedRouteForPreview: null,
	// Simulation State
	isSimulating: false,
	simulationSpeed: 0, // in mph
	simulationInterval: null,
	simulatedPosition: null,
	currentSimulatedSegmentIndex: 0,
	distanceIntoSegment: 0, // in meters
	lastRotationUpdateTime: 0, // throttle rotation updates
	lastMovementTime: 0, // timestamp of last reliable movement-based heading
	// GPS Smoothing State
	targetPosition: null, // Target position from GPS update
	interpolatedPosition: null, // Current smoothly interpolated position
	smoothingAnimationFrame: null, // Animation frame ID
	lastUpdateTime: 0, // Timestamp of last GPS update
	// Route Progress Tracking (One-way navigation)
	currentRouteIndex: 0, // Current furthest point reached on the route (one-way progression)
	maxRouteIndexReached: 0, // Maximum index ever reached (prevents backward jumps)
	// Speed Tracking
	currentSpeed: 0, // Current speed in mph
	lastSpeedUpdate: 0, // Timestamp of last speed calculation
};

// Constants
const LOOK_AHEAD_DISTANCE = 1609.34; // 1 mile in meters
const GPS_SMOOTHING_DURATION = 1000; // Milliseconds to interpolate between GPS updates (1 second)
const START_POINT_THRESHOLD = 50; // 50 meters to consider "reached start"
const OFF_ROUTE_THRESHOLD = 100; // 100 meters to consider user is off-route
const OSRM_API = "https://router.project-osrm.org/route/v1/driving/";
// Ratio controlling vertical offset of the user's position when auto-centering.
// 0.5 means exact center. Smaller values push the user marker further toward the bottom.
// Adjusted from 0.4 to 0.25 to keep the marker closer to bottom-middle for better look-ahead visibility.
const USER_VIEW_OFFSET_RATIO = 0.25;

// Test Centres Configuration
const TEST_CENTRES = {
	farnborough: {
		name: "Farnborough",
		location: "Hampshire",
		routes: [
			{ id: 1, file: "farnborough/Farnborough 07.0922.gpx", name: "Route 1" },
			{ id: 2, file: "farnborough/Farnborough 1.0921.gpx", name: "Route 2" },
			{ id: 3, file: "farnborough/Farnborough 10.0921.gpx", name: "Route 3" },
			{ id: 4, file: "farnborough/Farnborough 11.0921.gpx", name: "Route 4" },
			{ id: 5, file: "farnborough/Farnborough 12.0822.gpx", name: "Route 5" },
			{ id: 6, file: "farnborough/Farnborough 2.1121.gpx", name: "Route 6" },
			{ id: 7, file: "farnborough/Farnborough 3.0122.gpx", name: "Route 7" },
			{ id: 8, file: "farnborough/Farnborough 4.0322.gpx", name: "Route 8" },
			{ id: 9, file: "farnborough/Farnborough-05.2203 (1).gpx", name: "Route 9" },
			{ id: 10, file: "farnborough/Farnborough-06.2402.gpx", name: "Route 10" },
			{ id: 11, file: "farnborough/Farnborough-08.2402.gpx", name: "Route 11" },
			{ id: 12, file: "farnborough/Farnborough-09.2310.gpx", name: "Route 12" },
		],
	},
	basingstoke: {
		name: "Basingstoke",
		location: "Hampshire",
		routes: [
			{ id: 1, file: "basingstoke/Basingstoke-03.2209.gpx", name: "Route 3" },
			{ id: 2, file: "basingstoke/Basingstoke-04.2404.gpx", name: "Route 4" },
			{
				id: 3,
				file: "basingstoke/Basingstoke-05.2209-1.gpx",
				name: "Route 5 (Alt)",
			},
			{ id: 4, file: "basingstoke/Basingstoke-05.2209.gpx", name: "Route 5" },
			{ id: 5, file: "basingstoke/Basingstoke-06.2211.gpx", name: "Route 6" },
			{ id: 6, file: "basingstoke/Basingstoke-07.2211.gpx", name: "Route 7" },
			{ id: 7, file: "basingstoke/Basingstoke-08.2211.gpx", name: "Route 8" },
			{ id: 8, file: "basingstoke/Basingstoke-09.2301-1.gpx", name: "Route 9" },
			{ id: 9, file: "basingstoke/Basingstoke-10.2309.gpx", name: "Route 10" },
			{
				id: 10,
				file: "basingstoke/Basingstoke_Satnav_1.gpx",
				name: "Satnav Route 1",
			},
		],
	},
};

let selectedTestCentre = null;

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
	initializeEventListeners();
	loadTestCentres();
	preventZoom();

	// Load voices for speech synthesis
	if (window.speechSynthesis) {
		window.speechSynthesis.onvoiceschanged = () => {
			const voices = window.speechSynthesis.getVoices();
			console.log("Speech voices loaded:", voices.length);
		};
		// Trigger voice loading
		window.speechSynthesis.getVoices();
	}
});

// Prevent pinch zoom and double-tap zoom on Safari/iOS
function preventZoom() {
	// More aggressive double-tap zoom prevention for Safari
	let lastTouchEnd = 0;
	document.addEventListener(
		"touchend",
		(event) => {
			const now = Date.now();
			const timeDiff = now - lastTouchEnd;

			// Prevent double tap if within 500ms
			if (timeDiff < 500 && timeDiff > 0) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
			lastTouchEnd = now;
		},
		{ passive: false, capture: true }
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
	const backButton = document.getElementById("back-button");
	const previewBackButton = document.getElementById("preview-back-button");
	const startNavButton = document.getElementById("start-nav-button");
	const downloadGpxButton = document.getElementById("download-gpx-button");
	const downloadAllButton = document.getElementById("download-all-button");

	// Route start confirmation modal buttons
	const startRouteBtn = document.getElementById("start-route-btn");
	const dismissRouteBtn = document.getElementById("dismiss-route-btn");

	// Simulation controls
	const speedSlider = document.getElementById("speed-slider");
	const speedValue = document.getElementById("speed-value");
	const toggleSimulationButton = document.getElementById(
		"toggle-simulation-button"
	);
	let longPressTimer;

	fileInput.addEventListener("change", handleFileUpload);

	// Use a long press on the center button to toggle simulation controls
	centerButton.addEventListener("mousedown", () => {
		longPressTimer = setTimeout(toggleSimulationControls, 800); // 800ms for long press
	});
	centerButton.addEventListener("mouseup", () => clearTimeout(longPressTimer));
	centerButton.addEventListener("mouseleave", () =>
		clearTimeout(longPressTimer)
	);
	centerButton.addEventListener("touchstart", () => {
		longPressTimer = setTimeout(toggleSimulationControls, 800);
	});
	centerButton.addEventListener("touchend", () => clearTimeout(longPressTimer));
	centerButton.addEventListener("click", centerMapOnUser);

	resetButton.addEventListener("click", resetApp);
	enableLocationBtn.addEventListener("click", requestLocationPermission);
	cancelLocationBtn.addEventListener("click", closeLocationModal);
	togglePreviewButton.addEventListener("click", togglePreviewRoute);
	toggleRotationButton.addEventListener("click", toggleMapRotation);
	if (backButton) backButton.addEventListener("click", goBackToTestCentres);
	if (previewBackButton)
		previewBackButton.addEventListener("click", hideRoutePreview);
	if (startNavButton)
		startNavButton.addEventListener("click", startNavigationFromPreview);
	if (downloadGpxButton)
		downloadGpxButton.addEventListener("click", downloadSingleGpx);
	if (downloadAllButton)
		downloadAllButton.addEventListener("click", downloadAllGpx);

	// Route start confirmation listeners
	if (startRouteBtn) startRouteBtn.addEventListener("click", confirmStartRoute);
	if (dismissRouteBtn)
		dismissRouteBtn.addEventListener("click", dismissStartRouteModal);

	// Simulation listeners
	if (speedSlider) {
		speedSlider.addEventListener("input", (e) => {
			const speed = parseInt(e.target.value, 10);
			state.simulationSpeed = speed;
			if (speedValue) speedValue.textContent = speed;
			// If simulation is running, restart it to apply new speed
			if (state.isSimulating) {
				startSimulation();
			}
		});
	}

	if (toggleSimulationButton) {
		toggleSimulationButton.addEventListener("click", () => {
			if (state.isSimulating) {
				pauseSimulation();
			} else {
				startSimulation();
			}
		});
	}
}

// --- Simulation Functions ---

// Toggle visibility of simulation controls
function toggleSimulationControls() {
	if (!state.isNavigating) return; // Only show during navigation
	state.simulationMode = !state.simulationMode;
	const simControls = document.getElementById("simulation-controls");
	if (state.simulationMode) {
		simControls.classList.remove("hidden");
		// If there's no real GPS, start simulation from the beginning of the route
		if (!state.userPosition && state.gpxRoute.length > 0) {
			state.simulatedPosition = state.gpxRoute[0];
			state.currentSimulatedSegmentIndex = 0;
			state.distanceIntoSegment = 0;
			// Fake a position update to place the marker at the start
			processNewPosition(state.simulatedPosition.lat, state.simulatedPosition.lng);
		}
	} else {
		simControls.classList.add("hidden");
		pauseSimulation(); // Stop simulation when hiding controls
	}
}

// Start or resume the simulation
function startSimulation() {
	if (!state.simulationMode || state.simulationSpeed === 0) {
		pauseSimulation();
		return;
	}

	// If simulation is already running, clear the old interval
	if (state.simulationInterval) {
		clearInterval(state.simulationInterval);
	}

	state.isSimulating = true;
	updateSimulationButton(true);

	// If starting from scratch, initialize position
	if (!state.simulatedPosition && state.gpxRoute.length > 0) {
		state.simulatedPosition = state.gpxRoute[0];
		state.currentSimulatedSegmentIndex = 0;
		state.distanceIntoSegment = 0;
	}

	// Use the simulated position as the user position
	state.userPosition = state.simulatedPosition;

	// Start the simulation loop
	state.simulationInterval = setInterval(updateSimulation, 1000); // Update every second
}

// Pause the simulation
function pauseSimulation() {
	if (state.simulationInterval) {
		clearInterval(state.simulationInterval);
		state.simulationInterval = null;
	}
	state.isSimulating = false;
	updateSimulationButton(false);
}

// The main simulation loop
function updateSimulation() {
	if (!state.isSimulating || !state.gpxRoute || state.gpxRoute.length < 2) {
		return;
	}

	const speedMetersPerSecond = (state.simulationSpeed * 1609.34) / 3600; // Convert mph to m/s
	let distanceToTravel = speedMetersPerSecond; // Travel for 1 second

	while (distanceToTravel > 0) {
		const startPoint = state.gpxRoute[state.currentSimulatedSegmentIndex];
		const endPoint = state.gpxRoute[state.currentSimulatedSegmentIndex + 1];

		if (!startPoint || !endPoint) {
			pauseSimulation(); // Reached end of the route
			console.log("Simulation finished: End of route.");
			return;
		}

		const segmentLength = calculateDistance(startPoint, endPoint);
		const remainingDistanceInSegment = segmentLength - state.distanceIntoSegment;

		if (distanceToTravel >= remainingDistanceInSegment) {
			// Move to the next segment
			distanceToTravel -= remainingDistanceInSegment;
			state.distanceIntoSegment = 0;
			state.currentSimulatedSegmentIndex++;
			state.simulatedPosition = endPoint;
		} else {
			// Move along the current segment
			state.distanceIntoSegment += distanceToTravel;
			const fraction = state.distanceIntoSegment / segmentLength;
			state.simulatedPosition = interpolate(startPoint, endPoint, fraction);
			distanceToTravel = 0;
		}
	}

	// Update the map with the new simulated position (supports {lat,lng} or [lat,lon])
	const sim = getCoords(state.simulatedPosition);
	processNewPosition(
		sim.lat,
		sim.lng,
		10 // Fake accuracy
	);
}

// Update play/pause button icon
function updateSimulationButton(isPlaying) {
	const playIcon = document.getElementById("simulation-icon-play");
	const pauseIcon = document.getElementById("simulation-icon-pause");
	if (playIcon && pauseIcon) {
		playIcon.classList.toggle("hidden", isPlaying);
		pauseIcon.classList.toggle("hidden", !isPlaying);
	}
}

// Interpolate between two coordinates
function interpolate(p1, p2, fraction) {
	const lat = p1.lat + (p2.lat - p1.lat) * fraction;
	const lon = p1.lng + (p2.lng - p1.lng) * fraction;
	return [lat, lon]; // Return as array for processNewPosition
}

// --- End Simulation Functions ---

// Load Test Centres
function loadTestCentres() {
	const testCentreList = document.getElementById("test-centre-list");
	if (!testCentreList) return;

	testCentreList.innerHTML = "";

	Object.keys(TEST_CENTRES).forEach((centreKey) => {
		const centre = TEST_CENTRES[centreKey];
		const card = document.createElement("div");
		card.className = "test-centre-card";
		card.innerHTML = `
			<h3 class="test-centre-name">${centre.name}</h3>
			<p class="test-centre-location">${centre.location}</p>
		`;
		card.addEventListener("click", () => selectTestCentre(centreKey));
		testCentreList.appendChild(card);
	});
}

// Select Test Centre
function selectTestCentre(centreKey) {
	state.selectedTestCentre = centreKey;
	const centre = TEST_CENTRES[centreKey];

	// Update route section title
	document.getElementById(
		"route-section-title"
	).textContent = `${centre.name} Routes`;

	// Hide test centre selection, show route selection
	document.querySelector(".test-centre-section").classList.add("hidden");
	document.getElementById("route-section").classList.remove("hidden");

	// Load routes for this centre
	loadRoutesForCentre(centre);
}

// Go Back to Test Centres
function goBackToTestCentres() {
	state.selectedTestCentre = null;
	document.querySelector(".test-centre-section").classList.remove("hidden");
	document.getElementById("route-section").classList.add("hidden");
}

// Load Routes for Selected Centre
function loadRoutesForCentre(centre) {
	const routeList = document.getElementById("route-list");
	if (!routeList) return;

	routeList.innerHTML = "";

	centre.routes.forEach((route) => {
		const card = document.createElement("div");
		card.className = "route-card";
		card.innerHTML = `
			<div class="route-info">
				<h4 class="route-name">${route.name}</h4>
			</div>
			<svg class="route-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="5" y1="12" x2="19" y2="12"></line>
				<polyline points="12 5 19 12 12 19"></polyline>
			</svg>
		`;
		card.addEventListener("click", () => loadSelectedRoute(route));
		routeList.appendChild(card);
	});
}

// Load Selected Route
async function loadSelectedRoute(route) {
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

		state.gpxRoute = points;
		state.hasReachedStart = false;
		state.approachRoute = [];

		document.getElementById("file-info").textContent = `✓ ${route.name} loaded`;

		// Generate voice navigation steps from GPX route
		loadNavigationSteps(state.gpxRoute);

		setTimeout(() => {
			startNavigation();
		}, 200);
	} catch (error) {
		console.error(`Error loading route ${route.file}:`, error);
		alert("Error loading route. Please try another route.");
	}
}

// Toggle Preview Route
function togglePreviewRoute() {
	state.showPreview = !state.showPreview;

	const button = document.getElementById("toggle-preview-button");
	const label = button.querySelector(".button-label");

	if (state.showPreview) {
		button.title = "Hide route preview";
		if (label) label.textContent = "Preview On";
	} else {
		button.title = "Show route preview";
		if (label) label.textContent = "Preview Off";
		button.style.opacity = "0.6";
	}

	// Update the route display
	if (state.isNavigating && state.userPosition) {
		updateNavigation();
	}
}

// Show route preview
async function showRoutePreview(route) {
	try {
		const response = await fetch(`routes/${route.file}`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const gpxText = await response.text();
		const points = parseGPX(gpxText);
		if (points.length === 0) throw new Error("No route points found in GPX");

		state.selectedRouteForPreview = { ...route, points };

		document.getElementById("upload-section").classList.add("hidden");
		document.getElementById("route-preview-section").classList.remove("hidden");
		document.getElementById("preview-route-name").textContent = route.name;

		if (state.previewMap) {
			state.previewMap.remove();
		}

		// Calculate center of route for initial view
		const centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
		const centerLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;

		state.previewMap = new maplibregl.Map({
			container: "preview-map",
			style: "https://tiles.openfreemap.org/styles/liberty",
			center: [centerLng, centerLat],
			zoom: 12,
			attributionControl: true,
		});

		state.previewMap.on("load", () => {
			// Add route polyline as GeoJSON layer
			const routeGeoJSON = {
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: points.map((p) => [p.lng, p.lat]),
				},
			};

			state.previewMap.addSource("preview-route", {
				type: "geojson",
				data: routeGeoJSON,
			});

			state.previewMap.addLayer({
				id: "preview-route-line",
				type: "line",
				source: "preview-route",
				paint: {
					"line-color": "#3b82f6",
					"line-width": 5,
				},
			});

			// Add start marker
			const startEl = document.createElement("div");
			startEl.style.width = "24px";
			startEl.style.height = "24px";
			startEl.style.background = "#28a745";
			startEl.style.borderRadius = "50%";
			startEl.style.border = "3px solid white";
			startEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

			new maplibregl.Marker({ element: startEl })
				.setLngLat([points[0].lng, points[0].lat])
				.addTo(state.previewMap);

			// Add end marker
			const endEl = document.createElement("div");
			endEl.style.width = "24px";
			endEl.style.height = "24px";
			endEl.style.background = "#dc3545";
			endEl.style.borderRadius = "50%";
			endEl.style.border = "3px solid white";
			endEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

			new maplibregl.Marker({ element: endEl })
				.setLngLat([points[points.length - 1].lng, points[points.length - 1].lat])
				.addTo(state.previewMap);

			// Fit bounds to route
			const bounds = new maplibregl.LngLatBounds();
			points.forEach((p) => bounds.extend([p.lng, p.lat]));
			state.previewMap.fitBounds(bounds, { padding: 40 });
		});
	} catch (error) {
		console.error("Error showing route preview:", error);
		alert(`Failed to load route preview for ${route.name}.`);
	}
}

// Hide route preview
function hideRoutePreview() {
	document.getElementById("route-preview-section").classList.add("hidden");
	document.getElementById("upload-section").classList.remove("hidden");
	if (state.previewMap) {
		state.previewMap.remove();
		state.previewMap = null;
	}
	state.selectedRouteForPreview = null;
}

// Start navigation from preview
function startNavigationFromPreview() {
	if (!state.selectedRouteForPreview) {
		alert("No route selected for navigation.");
		return;
	}
	loadSelectedRouteForNavigation(state.selectedRouteForPreview);
}

// Download single GPX file
function downloadSingleGpx() {
	if (!state.selectedRouteForPreview) return;
	const { file, name } = state.selectedRouteForPreview;
	const link = document.createElement("a");
	link.href = `routes/${file}`;
	link.download = name.replace(/[^a-z0-9\s]/gi, "_") + ".gpx";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

// Download all GPX files as ZIP
async function downloadAllGpx() {
	if (!state.selectedTestCentre) return;

	const centre = TEST_CENTRES[state.selectedTestCentre];
	if (!centre || !centre.routes || centre.routes.length === 0) {
		alert("No routes available for the selected test centre.");
		return;
	}

	// Check for JSZip and load if not present
	if (typeof JSZip === "undefined") {
		const script = document.createElement("script");
		script.src =
			"https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
		document.head.appendChild(script);
		await new Promise((resolve) => (script.onload = resolve));
	}

	const zip = new JSZip();
	const routeFolder = zip.folder(centre.name.replace(/\s+/g, "_"));

	const downloadAllButton = document.getElementById("download-all-button");
	const originalButtonText = downloadAllButton.innerHTML;
	downloadAllButton.disabled = true;
	downloadAllButton.innerHTML = `
		<svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
			<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke-width="2" stroke-linecap="round"></path>
		</svg>
		<span>Zipping... (0/${centre.routes.length})</span>`;

	let filesZipped = 0;
	for (const route of centre.routes) {
		try {
			const response = await fetch(`routes/${route.file}`);
			if (response.ok) {
				const content = await response.blob();
				const fileName = route.file.split("/").pop();
				routeFolder.file(fileName, content);
			}
		} catch (error) {
			console.error(`Failed to fetch ${route.file}:`, error);
		}
		filesZipped++;
		downloadAllButton.querySelector(
			"span"
		).textContent = `Zipping... (${filesZipped}/${centre.routes.length})`;
	}

	zip.generateAsync({ type: "blob" }).then((content) => {
		const link = document.createElement("a");
		link.href = URL.createObjectURL(content);
		link.download = `${centre.name}_Routes.zip`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		// Restore button
		downloadAllButton.disabled = false;
		downloadAllButton.innerHTML = originalButtonText;
	});
}

// Toggle Map Rotation Mode (cycles through: route-up -> compass -> off -> route-up)
function toggleMapRotation() {
	const button = document.getElementById("toggle-rotation-button");
	const label = button.querySelector(".button-label");

	// Cycle through modes: route -> compass -> off -> route
	if (state.rotationMode === "route") {
		state.rotationMode = "compass";
		button.title = "Map rotates with phone compass";
		if (label) label.textContent = "Compass";
		enableDeviceCompass();
		applyMapRotation();
	} else if (state.rotationMode === "compass") {
		state.rotationMode = "off";
		button.title = "North always points up";
		if (label) label.textContent = "North Up";
		disableDeviceCompass();
		if (state.map) {
			setMapBearing(0);
		}
	} else {
		state.rotationMode = "route";
		button.title = "Map rotates to follow route direction";
		if (label) label.textContent = "Route Up";
		disableDeviceCompass();
		applyMapRotation();
	}
}

// Load Test Centres
function loadTestCentres() {
	const container = document.getElementById("test-centre-list");
	if (!container) return;

	container.innerHTML = "";

	Object.keys(TEST_CENTRES).forEach((centreKey) => {
		const centre = TEST_CENTRES[centreKey];
		const card = document.createElement("div");
		card.className = "test-centre-card";
		card.innerHTML = `
			<div class="centre-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
					<circle cx="12" cy="10" r="3"></circle>
				</svg>
			</div>
			<div class="centre-info">
				<h3 class="centre-name">${centre.name}</h3>
				<p class="centre-location">${centre.location}</p>
				<p class="centre-routes">${centre.routes.length} routes available</p>
			</div>
			<svg class="centre-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="9 18 15 12 9 6"></polyline>
			</svg>
		`;

		card.addEventListener("click", () => selectTestCentre(centreKey));
		container.appendChild(card);
	});
}

// Select a test centre and show its routes
function selectTestCentre(centreKey) {
	selectedTestCentre = centreKey;
	state.selectedTestCentre = centreKey;
	const centre = TEST_CENTRES[centreKey];

	// Hide test centre list, show routes
	document.querySelector(".test-centre-section").classList.add("hidden");
	const routeSection = document.getElementById("route-section");
	routeSection.classList.remove("hidden");

	// Update title
	document.getElementById(
		"route-section-title"
	).textContent = `${centre.name} Routes`;

	// Show download all button
	document.getElementById("download-all-button").classList.remove("hidden");

	// Load routes for this centre
	loadRoutesForCentre(centre);
}

// Go back to test centre selection
function goBackToTestCentres() {
	selectedTestCentre = null;
	state.selectedTestCentre = null;
	document.querySelector(".test-centre-section").classList.remove("hidden");
	document.getElementById("route-section").classList.add("hidden");
	document.getElementById("download-all-button").classList.add("hidden");

	// Clear any loaded route data
	state.presetRoutes = {};
	const routeList = document.getElementById("route-list");
	if (routeList) routeList.innerHTML = "";
}

// Load routes for selected test centre
function loadRoutesForCentre(centre) {
	const routeList = document.getElementById("route-list");
	if (!routeList) return;

	routeList.innerHTML = "";

	centre.routes.forEach((route) => {
		const card = document.createElement("div");
		card.className = "route-card";
		card.innerHTML = `
			<div class="route-info">
				<h4 class="route-name">${route.name}</h4>
			</div>
			<svg class="route-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="5" y1="12" x2="19" y2="12"></line>
				<polyline points="12 5 19 12 12 19"></polyline>
			</svg>
		`;
		card.addEventListener("click", () => showRoutePreview(route));
		routeList.appendChild(card);
	});
}

// Load Selected Route for Navigation
async function loadSelectedRouteForNavigation(route) {
	try {
		const points =
			route.points || parseGPX(await (await fetch(`routes/${route.file}`)).text());

		if (points.length === 0) {
			throw new Error("No route points found");
		}

		state.gpxRoute = points;
		state.hasReachedStart = false;
		state.approachRoute = [];

		document.getElementById("file-info").textContent = `✓ ${route.name} loaded`;

		// Generate voice navigation steps from GPX route
		loadNavigationSteps(state.gpxRoute);

		setTimeout(() => {
			startNavigation();
		}, 200);
	} catch (error) {
		console.error(`Error loading route:`, error);
		alert("Error loading route. Please try another route.");
	}
}

// Load routes for selected test centre (old function - to be removed)
async function loadRoutes(routes) {
	const container = document.getElementById("route-list");
	if (!container) return;

	container.innerHTML = "";
	state.presetRoutes = {};

	for (const route of routes) {
		const card = document.createElement("div");
		card.className = "route-card";
		card.innerHTML = `
			<div class="route-header">
				<div class="route-number">${route.id}</div>
				<div class="route-info">
					<h4 class="route-name">${route.name}</h4>
					<p class="route-status" id="route-status-${route.id}">Loading...</p>
				</div>
			</div>
			<button class="route-button" id="route-button-${route.id}" disabled>
				<span>Loading...</span>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6"></polyline>
				</svg>
			</button>
		`;

		container.appendChild(card);

		// Load route data
		(async () => {
			try {
				const response = await fetch(`routes/${route.file}`);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);

				const gpxText = await response.text();
				const points = parseGPX(gpxText);

				if (points.length === 0) throw new Error("No route points found");

				state.presetRoutes[route.id] = {
					file: route.file,
					points,
					name: route.name,
				};

				const totalDistance = calculateRouteDistance(points);
				const statusEl = document.getElementById(`route-status-${route.id}`);
				if (statusEl) {
					statusEl.textContent = `${formatDistance(totalDistance)} • ${
						points.length
					} points`;
				}

				const button = document.getElementById(`route-button-${route.id}`);
				if (button) {
					button.disabled = false;
					button.querySelector("span").textContent = "Start Navigation";
					button.addEventListener("click", () => loadPresetRoute(route.id));
				}
			} catch (error) {
				console.error(`Error loading route ${route.file}:`, error);
				const statusEl = document.getElementById(`route-status-${route.id}`);
				if (statusEl) statusEl.textContent = "Failed to load";

				const button = document.getElementById(`route-button-${route.id}`);
				if (button) {
					button.disabled = true;
					button.querySelector("span").textContent = "Unavailable";
				}
			}
		})();
	}
}

// Legacy function - kept for compatibility
async function loadPresetRoutes() {
	// This function is no longer used but kept for backward compatibility
	loadTestCentres();
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

	// Generate voice navigation steps from GPX route
	loadNavigationSteps(state.gpxRoute);

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

		// Generate voice navigation steps from GPX route
		loadNavigationSteps(state.gpxRoute);

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
				points.push({ lat, lng: lon });
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
				points.push({ lat, lng: lon });
			}
		}
	}

	return points;
}

// Start Navigation
function startNavigation() {
	// Switch to navigation view
	document.getElementById("upload-section").classList.add("hidden");
	document.getElementById("route-preview-section").classList.add("hidden");
	document.getElementById("navigation-section").classList.remove("hidden");

	// Reset navigation state for new route
	state.hasReachedStart = false;
	state.routeLockedIn = false;
	state.currentRouteIndex = 0;
	state.maxRouteIndexReached = 0;
	state.approachRoute = [];
	state.currentSpeed = 0;
	state.lastSpeedUpdate = 0;

	// Show speed indicator
	const speedIndicator = document.getElementById("speed-indicator");
	if (speedIndicator) {
		speedIndicator.classList.remove("hidden");
	}

	// Initialize map if not already done
	if (!state.map) {
		initializeMap();
	}

	// Center map on the route start point for navigation
	if (state.gpxRoute.length > 0) {
		const startPoint = state.gpxRoute[0];
		// Wait for map to be ready, then center on start
		if (state.map.loaded()) {
			state.map.easeTo({
				center: [startPoint.lng, startPoint.lat],
				zoom: 16,
				duration: 1000,
			});
		} else {
			state.map.once("load", () => {
				state.map.easeTo({
					center: [startPoint.lng, startPoint.lat],
					zoom: 16,
					duration: 1000,
				});
			});
		}
	}

	// Add start and end markers
	addRouteMarkers();

	// Initialize voice navigation button
	if (!document.getElementById("voice-button")) {
		initVoiceNavigation();
	}

	// Show location permission modal or simulation controls
	if (state.simulationMode) {
		document.getElementById("simulation-controls").classList.remove("hidden");
		if (!state.userPosition && state.gpxRoute.length > 0) {
			state.simulatedPosition = state.gpxRoute[0];
			processNewPosition(state.simulatedPosition.lat, state.simulatedPosition.lng);
		}
	} else {
		// Directly request location permission without showing custom modal
		requestLocationPermission();
	}

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

// Show Route Start Confirmation Modal
function showRouteStartModal() {
	document.getElementById("route-start-modal").classList.remove("hidden");
}

// Close Route Start Confirmation Modal
function closeRouteStartModal() {
	document.getElementById("route-start-modal").classList.add("hidden");
}

// Confirm starting the route (lock into one-way mode)
function confirmStartRoute() {
	state.routeLockedIn = true;
	state.currentRouteIndex = 0;
	state.maxRouteIndexReached = 0;
	closeRouteStartModal();
	updateStatusText("Route locked in - following one-way progression");
	console.log("🔒 Route locked in - one-way navigation mode activated");
}

// Dismiss the route start modal (user not ready yet)
function dismissStartRouteModal() {
	closeRouteStartModal();
	updateStatusText(
		`At route start - ${formatDistance(
			calculateDistance(state.userPosition, state.gpxRoute[0])
		)} away`
	);
}

// Request Location Permission
function requestLocationPermission() {
	// Check if geolocation is supported
	if (!navigator.geolocation) {
		alert("Geolocation is not supported by your browser.");
		return;
	}

	// Request compass access immediately while we're still in a user gesture (iOS requirement)
	// This ensures we always have compass data for the direction arrow
	enableDeviceCompass();

	// Make a one-time position request to trigger native browser permission dialog
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

// Initialize MapLibre GL JS Map
function initializeMap() {
	state.map = new maplibregl.Map({
		container: "map",
		style: "https://tiles.openfreemap.org/styles/liberty",
		center: [0, 0],
		zoom: 3,
		minZoom: 3,
		maxZoom: 19,
		bearing: 0,
		pitch: 0,
		attributionControl: true,
	});

	// Add navigation controls (zoom +/- buttons) to bottom left
	state.map.addControl(
		new maplibregl.NavigationControl({
			showCompass: false,
			visualizePitch: false,
		}),
		"bottom-left"
	);

	// Wait for map to load before setting bounds and adding arrow icon
	state.map.on("load", () => {
		// Create arrow icon for route decorations
		const canvas = document.createElement("canvas");
		canvas.width = 24;
		canvas.height = 24;
		const ctx = canvas.getContext("2d");

		// Draw arrow pointing up
		ctx.fillStyle = "#3b82f6";
		ctx.beginPath();
		ctx.moveTo(12, 2); // Top point
		ctx.lineTo(20, 22); // Bottom right
		ctx.lineTo(12, 18); // Bottom center
		ctx.lineTo(4, 22); // Bottom left
		ctx.closePath();
		ctx.fill();

		// Add image to map
		state.map.addImage("arrow", {
			width: 24,
			height: 24,
			data: ctx.getImageData(0, 0, 24, 24).data,
		});

		// Set initial view to GPX route
		if (state.gpxRoute.length > 0) {
			const bounds = new maplibregl.LngLatBounds();
			state.gpxRoute.forEach((point) => {
				bounds.extend([point.lng, point.lat]);
			});
			state.map.fitBounds(bounds, { padding: 50 });
		}
	});

	// Disable auto-center when user manually moves the map (pan, zoom, etc.)
	state.map.on("movestart", (e) => {
		// This check is crucial: it ensures we only disable auto-center on real user input (mouse, touch)
		// and not when our own code moves the map (e.g., during recentering).
		if (e.originalEvent) {
			state.autoCenterEnabled = false;
			updateCenterButtonState();
		}
	});

	// Initialize button labels
	const rotationButton = document.getElementById("toggle-rotation-button");
	const rotationLabel = rotationButton?.querySelector(".button-label");
	if (rotationLabel) {
		rotationLabel.textContent = "Route Up";
	}

	const previewButton = document.getElementById("toggle-preview-button");
	const previewLabel = previewButton?.querySelector(".button-label");
	if (previewLabel) {
		previewLabel.textContent = state.showPreview ? "Preview On" : "Preview Off";
	}
}

// Add Start and End Markers
function addRouteMarkers() {
	if (state.gpxRoute.length === 0) return;

	const startPoint = state.gpxRoute[0];
	const endPoint = state.gpxRoute[state.gpxRoute.length - 1];

	// Custom start marker (green pin)
	const startEl = document.createElement("div");
	startEl.style.width = "30px";
	startEl.style.height = "30px";
	startEl.style.background = "#28a745";
	startEl.style.borderRadius = "50% 50% 50% 0";
	startEl.style.transform = "rotate(-45deg)";
	startEl.style.border = "3px solid white";
	startEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

	state.startMarker = new maplibregl.Marker({
		element: startEl,
		anchor: "bottom",
	})
		.setLngLat([startPoint.lng, startPoint.lat])
		.addTo(state.map);

	// Custom end marker (red pin)
	const endEl = document.createElement("div");
	endEl.style.width = "30px";
	endEl.style.height = "30px";
	endEl.style.background = "#dc3545";
	endEl.style.borderRadius = "50% 50% 50% 0";
	endEl.style.transform = "rotate(-45deg)";
	endEl.style.border = "3px solid white";
	endEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

	state.endMarker = new maplibregl.Marker({ element: endEl, anchor: "bottom" })
		.setLngLat([endPoint.lng, endPoint.lat])
		.addTo(state.map);
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

	// Initialize center button state
	updateCenterButtonState();

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
	// If simulation is active, ignore real GPS updates
	if (state.isSimulating) {
		console.log("Simulation is active, ignoring real GPS update.");
		return;
	}
	processNewPosition(latitude, longitude, accuracy, heading);
}

// Process a new position (real or simulated)
function processNewPosition(latitude, longitude, accuracy, heading) {
	state.userPosition = [latitude, longitude];

	// Calculate speed from position changes with improved accuracy
	if (state.lastPosition) {
		const now = Date.now();
		const timeDelta = (now - state.lastSpeedUpdate) / 1000; // seconds

		if (timeDelta >= 0.3) {
			// Update speed every 0.3 seconds for more responsiveness
			const distanceMoved = calculateDistance(state.lastPosition, [
				latitude,
				longitude,
			]);
			const speedMs = distanceMoved / timeDelta; // m/s
			const instantSpeed = speedMs * 2.23694; // Convert to mph

			// Minimal smoothing - just 20% to reduce GPS noise
			if (state.currentSpeed === 0) {
				state.currentSpeed = instantSpeed;
			} else {
				// Light exponential moving average - mostly use new data
				state.currentSpeed = state.currentSpeed * 0.2 + instantSpeed * 0.8;
			}

			state.lastSpeedUpdate = now;

			// Update speed display
			updateSpeedDisplay();
		}
	} else {
		state.lastSpeedUpdate = Date.now();
	}

	// Calculate heading if not provided by GPS or if we have movement
	let calculatedHeading = heading;
	if (state.lastPosition) {
		// Calculate bearing from movement
		const movementHeading = calculateBearing(state.lastPosition, [
			latitude,
			longitude,
		]);

		// Use movement heading if GPS heading is not available or if we've moved significantly
		const distanceMoved = calculateDistance(state.lastPosition, [
			latitude,
			longitude,
		]);
		if (distanceMoved > 2) {
			// Only update if moved more than 2 meters
			calculatedHeading = movementHeading;
			state.lastMovementTime = Date.now();
		}
	}

	// Update heading if we have a valid value
	if (
		calculatedHeading !== null &&
		calculatedHeading !== undefined &&
		!isNaN(calculatedHeading)
	) {
		state.gpsHeading = calculatedHeading;
		// If we don't have compass data, use GPS heading
		if (!state.orientationListenerActive || state.deviceHeading === null) {
			state.currentHeading = calculatedHeading;
		}
	}

	state.lastPosition = [latitude, longitude];

	// Initialize interpolated position if this is the first update
	if (!state.interpolatedPosition) {
		state.interpolatedPosition = [latitude, longitude];
	}

	// Set target position and start smooth interpolation
	state.targetPosition = [latitude, longitude];
	state.lastUpdateTime = Date.now();

	// Cancel any existing animation
	if (state.smoothingAnimationFrame) {
		cancelAnimationFrame(state.smoothingAnimationFrame);
	}

	// Start new smoothing animation
	state.smoothingAnimationFrame = requestAnimationFrame(smoothPositionUpdate);

	// Update or create user marker (initial creation only, position will be updated by animation)
	updateUserMarker(latitude, longitude, accuracy);

	// Update navigation
	updateNavigation();

	// Check voice guidance using new system
	if (state.voiceEnabled) {
		updateVoiceNavigation(state.userPosition);
	}
}

// GPS Smoothing Animation
function smoothPositionUpdate() {
	if (!state.targetPosition || !state.interpolatedPosition) {
		return;
	}

	const now = Date.now();
	const elapsed = now - state.lastUpdateTime;
	const progress = Math.min(elapsed / GPS_SMOOTHING_DURATION, 1);

	// Use easeOutQuad for smooth deceleration
	const easeProgress = 1 - Math.pow(1 - progress, 2);

	// Interpolate position
	const startLat = state.interpolatedPosition[0];
	const startLon = state.interpolatedPosition[1];
	const targetLat = state.targetPosition[0];
	const targetLon = state.targetPosition[1];

	const currentLat = startLat + (targetLat - startLat) * easeProgress;
	const currentLon = startLon + (targetLon - startLon) * easeProgress;

	state.interpolatedPosition = [currentLat, currentLon];

	// Update marker with interpolated position
	if (state.userMarker) {
		state.userMarker.setLngLat([currentLon, currentLat]);
	}

	// Update accuracy circle position
	if (state.map.getSource("user-accuracy")) {
		state.map.getSource("user-accuracy").setData({
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: [currentLon, currentLat],
			},
		});
	}

	// Update map center if auto-center is enabled
	if (state.autoCenterEnabled) {
		const instantFollow = state.rotationMode !== "off";
		centerOnLatLngWithOffset(
			[currentLon, currentLat],
			Math.max(state.map.getZoom(), 16),
			{ animate: false } // Don't animate center during smooth interpolation
		);
	}

	// Apply map rotation continuously during smoothing if rotation mode is enabled
	if (state.rotationMode !== "off") {
		applyMapRotation();
	}

	// Continue animation if not yet reached target
	if (progress < 1) {
		state.smoothingAnimationFrame = requestAnimationFrame(smoothPositionUpdate);
	} else {
		state.smoothingAnimationFrame = null;
	}
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
		if (state.orientationListenerActive) {
			console.log("Device compass already active");
			return;
		}

		console.log("Enabling device compass...");

		if (
			typeof DeviceOrientationEvent !== "undefined" &&
			typeof DeviceOrientationEvent.requestPermission === "function"
		) {
			// iOS 13+ permission flow
			console.log("Requesting device orientation permission (iOS)...");
			const perm = await DeviceOrientationEvent.requestPermission();
			console.log("Device orientation permission:", perm);
			if (perm !== "granted") {
				console.warn("Device orientation permission not granted");
				updateStatusText("Compass permission denied");
				return;
			}
		}

		// Register listener
		window.addEventListener("deviceorientation", onDeviceOrientation, true);
		state.orientationListenerActive = true;
		console.log("Device compass enabled successfully");
	} catch (e) {
		console.error("Device orientation unavailable", e);
		updateStatusText("Compass not available on this device");
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
	let headingDeg = null;
	// iOS Safari provides webkitCompassHeading (0 = North, clockwise)
	if (typeof event.webkitCompassHeading === "number") {
		headingDeg = event.webkitCompassHeading;
	} else if (typeof event.alpha === "number") {
		// Fallback estimate: alpha rotates with device; convert so 0 = North
		headingDeg = (360 - event.alpha) % 360;
	}

	if (headingDeg !== null && !isNaN(headingDeg)) {
		// Log occasionally for debugging (every 30 events ~ every 1 second)
		if (!state.compassEventCount) state.compassEventCount = 0;
		state.compassEventCount++;
		if (state.compassEventCount % 30 === 0) {
			console.log(
				`Compass heading: ${headingDeg.toFixed(1)}°, mode: ${state.rotationMode}`
			);
		}

		state.deviceHeading = headingDeg;
		// Always update current heading for the arrow, regardless of rotation mode
		state.currentHeading = headingDeg;

		// Update the user marker to show the new heading
		if (state.userPosition && state.userMarker) {
			updateUserMarker(
				state.userPosition[0],
				state.userPosition[1],
				state.userAccuracyCircle ? state.userAccuracyCircle.accuracy : 10
			);
		}

		// In compass mode, apply rotation immediately since compass updates are frequent
		if (state.rotationMode === "compass") {
			applyMapRotation();
		}
	}
}

// Smooth heading transitions to reduce jerkiness
function smoothHeading(newHeading, oldHeading, smoothingFactor = 0.3) {
	// Handle wraparound at 0/360 degrees
	let delta = newHeading - oldHeading;

	// Normalize delta to be between -180 and 180
	while (delta > 180) delta -= 360;
	while (delta < -180) delta += 360;

	// Apply smoothing
	const smoothedDelta = delta * smoothingFactor;
	let result = oldHeading + smoothedDelta;

	// Normalize result to 0-360
	while (result < 0) result += 360;
	while (result >= 360) result -= 360;

	return result;
}

// Apply map rotation from best available source: device heading, GPS bearing, or route bearing
function applyMapRotation() {
	if (!state.map || state.rotationMode === "off") {
		return;
	}

	let heading = null;
	const nowTs = Date.now();

	if (state.rotationMode === "compass") {
		// Compass mode logic remains the same
		if (typeof state.deviceHeading === "number" && !isNaN(state.deviceHeading)) {
			heading = state.deviceHeading;
		} else if (typeof state.gpsHeading === "number" && !isNaN(state.gpsHeading)) {
			heading = state.gpsHeading;
		}
		if (heading !== null) {
			// Initialize smoothedHeading if not set
			if (
				state.smoothedHeading === null ||
				state.smoothedHeading === undefined ||
				isNaN(state.smoothedHeading)
			) {
				state.smoothedHeading = heading;
			}
			heading = smoothHeading(heading, state.smoothedHeading, 0.3);
		}
	} else if (state.rotationMode === "route" && state.userPosition) {
		// Prefer recent GPS movement direction; fall back to route lookahead when stationary
		const hasRecentMovement =
			typeof state.gpsHeading === "number" &&
			!isNaN(state.gpsHeading) &&
			state.lastMovementTime &&
			nowTs - state.lastMovementTime < 4000; // 4s recency window

		if (hasRecentMovement) {
			heading = state.gpsHeading;
		} else {
			let activeRoute = state.hasReachedStart
				? state.gpxRoute
				: state.approachRoute;
			if (activeRoute && activeRoute.length > 1) {
				const progress = findNearestPointOnRoute(state.userPosition, activeRoute);
				heading = computeRouteHeading(activeRoute, progress.index, 40);
			}
			if (
				heading === null &&
				typeof state.gpsHeading === "number" &&
				!isNaN(state.gpsHeading)
			) {
				heading = state.gpsHeading;
			}
		}
		if (heading !== null) {
			heading = smoothHeading(heading, state.smoothedHeading || heading, 0.15);
		}
	}

	if (heading === null || isNaN(heading)) {
		return;
	}

	state.smoothedHeading = heading;
	state.currentHeading = heading;
	setMapBearing(state.currentHeading);
}

// Helper function to get a point a certain distance ahead on the route
function getPointAhead(route, startIndex, distanceAhead) {
	let accumulatedDistance = 0;
	for (let i = startIndex; i < route.length - 1; i++) {
		const segmentDistance = calculateDistance(route[i], route[i + 1]);
		if (accumulatedDistance + segmentDistance >= distanceAhead) {
			const fraction = (distanceAhead - accumulatedDistance) / segmentDistance;
			return interpolate(route[i], route[i + 1], fraction);
		}
		accumulatedDistance += segmentDistance;
	}
	return route[route.length - 1]; // Return last point if not found
}

// Compute a stable heading looking "distanceAheadMeters" along the route.
// Falls back to immediate next segment or previous segment if near the end.
function computeRouteHeading(route, currentIndex, distanceAheadMeters = 40) {
	if (!route || route.length < 2) return null;
	// Clamp index
	currentIndex = Math.max(0, Math.min(currentIndex, route.length - 1));

	// If at or beyond penultimate point, use previous segment
	if (currentIndex >= route.length - 2) {
		return calculateBearing(route[route.length - 2], route[route.length - 1]);
	}

	// Try lookahead point
	const startPoint = route[currentIndex];
	const lookPoint = getPointAhead(route, currentIndex, distanceAheadMeters);
	if (startPoint && lookPoint) {
		return calculateBearing(startPoint, lookPoint);
	}

	// Fallback to next segment
	if (route[currentIndex + 1]) {
		return calculateBearing(route[currentIndex], route[currentIndex + 1]);
	}

	return null;
}

// Set map bearing with smooth animation
function setMapBearing(angleDeg) {
	if (!state.map) return;

	const currentBearing = state.map.getBearing();

	// Normalize the angle difference to avoid spinning the long way around
	let delta = angleDeg - currentBearing;
	while (delta > 180) delta -= 360;
	while (delta < -180) delta += 360;

	const targetBearing = currentBearing + delta;

	// Use jumpTo for very small changes to avoid animation overhead
	if (Math.abs(delta) < 1) {
		state.map.jumpTo({ bearing: targetBearing });
		return;
	}

	// Use a very short duration for smooth continuous rotation
	// This works well with requestAnimationFrame updates
	state.map.easeTo({
		bearing: targetBearing,
		duration: 100, // Short duration for responsive, smooth rotation
		easing: (t) => t, // Linear easing for consistent rotation speed
	});
}

// Update User Marker with heading indicator
function updateUserMarker(lat, lon, accuracy) {
	// Get current heading for display - prioritize device compass, fall back to GPS heading
	let displayHeading = 0;

	if (state.deviceHeading !== null && state.deviceHeading !== undefined) {
		// Use device compass heading if available
		displayHeading = state.deviceHeading;
	} else if (state.gpsHeading !== null && state.gpsHeading !== undefined) {
		// Fall back to GPS-calculated heading
		displayHeading = state.gpsHeading;
	} else if (
		state.currentHeading !== null &&
		state.currentHeading !== undefined
	) {
		// Last resort: use any stored heading
		displayHeading = state.currentHeading;
	}

	// Get the current map bearing to counter-rotate the arrow
	const mapBearing = state.map ? state.map.getBearing() : 0;

	// Counter-rotate the arrow so it points true north relative to the screen
	// When map rotates clockwise, arrow needs to rotate counter-clockwise by the same amount
	const arrowRotation = displayHeading - mapBearing;

	if (!state.userMarker) {
		// Create custom user marker element
		const markerEl = document.createElement("div");
		markerEl.className = "user-marker-container";
		markerEl.style.width = "40px";
		markerEl.style.height = "40px";
		markerEl.innerHTML = `
			<div class="user-marker-wrapper" style="transform: rotate(${arrowRotation}deg)">
				<div class="user-marker-arrow"></div>
				<div class="user-marker-dot"></div>
			</div>
		`;

		state.userMarker = new maplibregl.Marker({ element: markerEl })
			.setLngLat([lon, lat])
			.addTo(state.map);

		// Create accuracy circle as GeoJSON source
		if (!state.map.getSource("user-accuracy")) {
			state.map.addSource("user-accuracy", {
				type: "geojson",
				data: {
					type: "Feature",
					geometry: {
						type: "Point",
						coordinates: [lon, lat],
					},
				},
			});

			state.map.addLayer({
				id: "user-accuracy-circle",
				type: "circle",
				source: "user-accuracy",
				paint: {
					"circle-radius": {
						stops: [
							[0, 0],
							[20, metersToPixelsAtMaxZoom(accuracy, lat)],
						],
						base: 2,
					},
					"circle-color": "#3b82f6",
					"circle-opacity": 0.1,
					"circle-stroke-width": 1,
					"circle-stroke-color": "#3b82f6",
					"circle-stroke-opacity": 0.3,
				},
			});
		}

		state.userAccuracyCircle = { lat, lon, accuracy };
	} else {
		// Update marker rotation only (position is handled by smoothing animation)
		const markerEl = state.userMarker.getElement();
		const wrapper = markerEl.querySelector(".user-marker-wrapper");
		if (wrapper) {
			wrapper.style.transform = `rotate(${arrowRotation}deg)`;
		}

		// Update accuracy circle radius only (position is handled by smoothing animation)
		if (state.map.getSource("user-accuracy")) {
			// Update radius
			state.map.setPaintProperty("user-accuracy-circle", "circle-radius", {
				stops: [
					[0, 0],
					[20, metersToPixelsAtMaxZoom(accuracy, lat)],
				],
				base: 2,
			});
		}

		state.userAccuracyCircle = { lat, lon, accuracy };
	}
}

// Helper function to convert meters to pixels at max zoom for circle radius
function metersToPixelsAtMaxZoom(meters, latitude) {
	const earthCircumference = 40075017;
	const latitudeRadians = (latitude * Math.PI) / 180;
	return (
		(meters / earthCircumference) *
		Math.cos(latitudeRadians) *
		Math.pow(2, 20) *
		512
	);
}

// Update Navigation Logic
async function updateNavigation() {
	if (!state.userPosition || state.gpxRoute.length === 0) return;

	const startPoint = state.gpxRoute[0];
	const distanceToStart = calculateDistance(state.userPosition, startPoint);

	// Check if user has reached the start point for the first time
	if (!state.hasReachedStart && distanceToStart <= START_POINT_THRESHOLD) {
		state.hasReachedStart = true;
		// Show confirmation modal to lock into the route
		showRouteStartModal();
		updateStatusText(
			`Ready to start - ${formatDistance(distanceToStart)} from start`
		);
		return;
	}

	// If user hasn't locked into the route yet, just navigate to start
	if (!state.routeLockedIn) {
		if (distanceToStart > START_POINT_THRESHOLD) {
			// User moved away from start without locking in
			state.hasReachedStart = false;
			updateStatusText(
				`Navigating to route start (${formatDistance(distanceToStart)})`
			);
			await updateApproachRoute();
		} else {
			// At start point but not locked in yet
			updateStatusText(
				`At route start - ready to begin (${formatDistance(distanceToStart)})`
			);
			await updateApproachRoute();
		}
		return;
	}

	// Route is locked in - enforce one-way navigation
	const progress = findNearestPointOnRoute(state.userPosition, state.gpxRoute);

	// Check if user is significantly off-route
	if (progress.distance > OFF_ROUTE_THRESHOLD) {
		// User is off-route - guide them back to the route ahead of their current position
		updateStatusText(
			`Off route - navigating back (${formatDistance(progress.distance)} away)`
		);
		await updateRerouteToCurrentPosition(progress.index);
	} else {
		// User is on route - show normal status
		const remainingDistance = calculateRemainingDistance(
			progress.index,
			state.gpxRoute
		);
		updateStatusText(`On route - ${formatDistance(remainingDistance)} remaining`);
		// Clear any reroute when back on route
		state.approachRoute = [];
		updateVisibleRoute(progress.index);
	}
}

// Update Reroute to Current Position on Route (for off-route scenarios)
async function updateRerouteToCurrentPosition(routeIndex) {
	if (!state.userPosition || state.gpxRoute.length === 0) return;

	const start = state.userPosition;

	// When locked in, always route to a point ahead on the route, never backward
	// Use the max of current index to prevent routing backward
	let targetIndex = routeIndex;
	if (state.routeLockedIn) {
		targetIndex = Math.max(routeIndex, state.currentRouteIndex);

		// Look ahead to find a good rejoin point (not too close, easier to route to)
		const LOOK_AHEAD_POINTS = 10; // Look 10 points ahead for a better rejoin point
		targetIndex = Math.min(
			targetIndex + LOOK_AHEAD_POINTS,
			state.gpxRoute.length - 1
		);
	}

	const targetPoint = state.gpxRoute[targetIndex];

	console.log(
		"🗺️ Calculating reroute from",
		start,
		"to route at index",
		targetIndex,
		"(locked in:",
		state.routeLockedIn,
		")"
	);

	try {
		const route = await getOSRMRoute(start, targetPoint);
		if (route && route.length > 0) {
			console.log("✅ Reroute calculated:", route.length, "points");
			state.approachRoute = route;

			// Combine reroute with remaining GPX route from target position
			const remainingRoute = state.gpxRoute.slice(targetIndex);
			const combinedRoute = [...state.approachRoute, ...remainingRoute];
			displayRoute(combinedRoute, "#F59E0B"); // Orange color for rerouting
		}
	} catch (error) {
		console.error("Error getting reroute:", error);
		// Fallback: draw straight line to target position
		const remainingRoute = state.gpxRoute.slice(targetIndex);
		const combinedRoute = [state.userPosition, ...remainingRoute];
		displayRoute(combinedRoute, "#F59E0B"); // Orange color for rerouting
	}
}

// Update Approach Route to Start Point
async function updateApproachRoute() {
	if (!state.userPosition || state.gpxRoute.length === 0) return;

	const start = state.userPosition;
	const end = state.gpxRoute[0];

	console.log("🗺️ Calculating approach route from", start, "to", end);

	try {
		const route = await getOSRMRoute(start, end);
		if (route && route.length > 0) {
			console.log("✅ Approach route calculated:", route.length, "points");
			state.approachRoute = route;

			// Combine approach route with GPX route for seamless transition
			const combinedRoute = [...state.approachRoute, ...state.gpxRoute];
			displayRoute(combinedRoute, "#4285F4"); // Use the new function
		}
	} catch (error) {
		console.error("Error getting approach route:", error);
		// Fallback: draw straight line to start
		const combinedRoute = [state.userPosition, ...state.gpxRoute];
		displayRoute(combinedRoute, "#4285F4"); // Use the new function
	}
}

// Get Route from OSRM API
async function getOSRMRoute(start, end) {
	// Normalize coordinates to handle both array and object formats
	const startCoords = getCoords(start);
	const endCoords = getCoords(end);

	const url = `${OSRM_API}${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?overview=full&geometries=geojson&steps=true&annotations=true`;

	try {
		const response = await fetch(url);
		const data = await response.json();

		if (data.code === "Ok" && data.routes && data.routes.length > 0) {
			const route = data.routes[0];
			const coordinates = route.geometry.coordinates;

			// Convert [lon, lat] to {lat, lng} objects
			return coordinates.map((coord) => ({ lat: coord[1], lng: coord[0] }));
		}
		return null;
	} catch (error) {
		console.error("OSRM API Error:", error);
		return null;
	}
}

// Update Visible Route (Look-ahead)
function updateVisibleRoute(startIndex) {
	displayRoute(state.gpxRoute, "#7C3AED"); // Use the new function
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
function displayRoute(fullRoute, color) {
	if (!state.map || !state.userPosition) return;

	// Always find the user's progress along the FULL route
	const progress = findNearestPointOnRoute(state.userPosition, fullRoute);
	const startIndex = progress.index;

	// --- Calculate the two parts of the route ---
	const lookAheadRoute = getLookAheadRoute(fullRoute, startIndex);
	const previewRoute = getPreviewRoute(fullRoute, startIndex);

	// --- Prepare GeoJSON data sources ---
	const lookAheadGeoJSON = {
		type: "Feature",
		geometry: {
			type: "LineString",
			coordinates: lookAheadRoute.map((p) => [p.lng, p.lat]),
		},
	};

	const previewGeoJSON = {
		type: "Feature",
		geometry: {
			type: "LineString",
			coordinates: previewRoute.map((p) => [p.lng, p.lat]),
		},
	};

	// --- Update or create map sources and layers ---

	// 1. The main "Look Ahead" route (always visible)
	if (state.map.getSource("look-ahead-route")) {
		state.map.getSource("look-ahead-route").setData(lookAheadGeoJSON);
	} else {
		state.map.addSource("look-ahead-route", {
			type: "geojson",
			data: lookAheadGeoJSON,
		});
		state.map.addLayer({
			id: "look-ahead-route-line",
			type: "line",
			source: "look-ahead-route",
			paint: { "line-color": color, "line-width": 8, "line-opacity": 0.9 },
			layout: { "line-join": "round", "line-cap": "round" },
		});
		if (state.map.hasImage("arrow")) {
			state.map.addLayer({
				id: "look-ahead-route-arrows",
				type: "symbol",
				source: "look-ahead-route",
				layout: {
					"symbol-placement": "line",
					"symbol-spacing": 100,
					"icon-image": "arrow",
					"icon-size": 0.5,
					"icon-rotation-alignment": "map",
					"icon-allow-overlap": true,
				},
			});
		}
	}

	// 2. The "Preview" route (the rest of the route, conditionally visible)
	if (state.map.getSource("preview-route")) {
		state.map.getSource("preview-route").setData(previewGeoJSON);
	} else {
		state.map.addSource("preview-route", {
			type: "geojson",
			data: previewGeoJSON,
		});
		state.map.addLayer({
			id: "preview-route-line",
			type: "line",
			source: "preview-route",
			paint: { "line-color": color, "line-width": 6, "line-opacity": 0.4 }, // More transparent
			layout: { "line-join": "round", "line-cap": "round" },
		});
	}

	// 3. Toggle visibility based on state.showPreview
	const previewVisibility = state.showPreview ? "visible" : "none";
	if (state.map.getLayer("preview-route-line")) {
		state.map.setLayoutProperty(
			"preview-route-line",
			"visibility",
			previewVisibility
		);
	}
}

// Find Nearest Point on Route (One-way progression)
function findNearestPointOnRoute(position, route) {
	if (!state.routeLockedIn) {
		// Before locking into the route, just find the absolute nearest point
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

	// Once route is locked in, enforce strict one-way forward progression
	// This prevents backward jumps when roads overlap or loop back
	const BACKWARD_TOLERANCE = 3; // Minimal backward tolerance for GPS drift only
	const FORWARD_SEARCH_WINDOW = 200; // Search ahead up to 200 points

	// Calculate search bounds - heavily favor forward direction
	const searchStart = Math.max(0, state.currentRouteIndex - BACKWARD_TOLERANCE);
	const searchEnd = Math.min(
		route.length - 1,
		state.currentRouteIndex + FORWARD_SEARCH_WINDOW
	);

	let minDistance = Infinity;
	let nearestIndex = state.currentRouteIndex; // Default to current position

	// Search within the forward-focused window
	for (let i = searchStart; i <= searchEnd; i++) {
		const distance = calculateDistance(position, route[i]);
		if (distance < minDistance) {
			minDistance = distance;
			nearestIndex = i;
		}
	}

	// Only allow forward progression when locked in
	// Small backward movements are only allowed within tight tolerance for GPS drift
	if (nearestIndex >= state.currentRouteIndex) {
		// Forward progression - update both indices
		state.currentRouteIndex = nearestIndex;
		state.maxRouteIndexReached = Math.max(
			state.maxRouteIndexReached,
			nearestIndex
		);
	} else if (
		nearestIndex >= searchStart &&
		nearestIndex < state.currentRouteIndex
	) {
		// Very small backward movement within tolerance - likely GPS drift
		// Allow it but don't update maxRouteIndexReached
		state.currentRouteIndex = nearestIndex;
	}
	// If nearestIndex is before searchStart, ignore it completely (too far back)

	return { index: nearestIndex, distance: minDistance };
}

// Calculate Distance Between Two Points (Haversine)
function calculateDistance(point1, point2) {
	const R = 6371e3; // Earth's radius in meters
	const p1 = getCoords(point1);
	const p2 = getCoords(point2);

	const φ1 = (p1.lat * Math.PI) / 180;
	const φ2 = (p2.lat * Math.PI) / 180;
	const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
	const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

// Helper function to normalize coordinates from both array and object formats
function getCoords(point) {
	if (Array.isArray(point)) {
		return { lat: point[0], lng: point[1] };
	}
	return point; // Assumes it's already {lat, lng}
}

// Calculate Bearing between two points (for heading calculation)
function calculateBearing(point1, point2) {
	const p1 = getCoords(point1);
	const p2 = getCoords(point2);

	const lat1 = (p1.lat * Math.PI) / 180;
	const lat2 = (p2.lat * Math.PI) / 180;
	const lon1 = (p1.lng * Math.PI) / 180;
	const lon2 = (p2.lng * Math.PI) / 180;

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

// Update Speed Display
function updateSpeedDisplay() {
	const speedIndicator = document.getElementById("speed-indicator");
	const currentSpeedValue = document.getElementById("current-speed-value");

	if (!speedIndicator || !currentSpeedValue) return;

	// Show speed indicator when navigating
	if (state.isNavigating) {
		speedIndicator.classList.remove("hidden");
	}

	// Update current speed with one decimal place for more precision
	const speed = state.currentSpeed.toFixed(1);
	currentSpeedValue.textContent = speed;
}

// Center map on a lat/lng with vertical offset so the user sees more ahead
function centerOnLatLngWithOffset(latlng, zoom, animationOptions = {}) {
	if (!state.map || !latlng) return;
	const map = state.map;
	const targetZoom = zoom ?? map.getZoom() ?? 16;

	// Calculate the new center point manually to account for rotation
	const canvas = map.getCanvas();
	const mapHeight = canvas.clientHeight;
	const verticalOffset = mapHeight * (0.5 - USER_VIEW_OFFSET_RATIO); // Pixels to shift center up

	// Project the user's location to a screen point
	const screenPoint = map.project(latlng);

	// Apply the offset
	const newCenterScreenPoint = {
		x: screenPoint.x,
		y: screenPoint.y - verticalOffset, // Subtract to move the center point up on the screen
	};

	// Unproject the new screen point to a map coordinate
	const newCenterLatLng = map.unproject(newCenterScreenPoint);

	const animate = animationOptions.animate !== false;
	const duration =
		animationOptions.duration !== undefined
			? animationOptions.duration * 1000
			: 500;

	if (animate) {
		// IMPORTANT: Do not set 'bearing' here. Let the current/ongoing rotation persist.
		// Setting a fixed bearing here could overwrite a recent route-up rotation
		// if both animations run close together.
		map.easeTo({
			center: newCenterLatLng, // Use the manually calculated center
			zoom: targetZoom,
			duration: duration,
			easing: (t) => t * (2 - t), // Ease out quad
		});
	} else {
		// Likewise, avoid specifying bearing on instant jumps.
		map.jumpTo({
			center: newCenterLatLng,
			zoom: targetZoom,
		});
	}
}

// Center Map on User (also acts as auto-follow toggle)
function centerMapOnUser() {
	if (!state.userPosition) return;

	// Toggle auto-center when already enabled
	if (state.autoCenterEnabled) {
		state.autoCenterEnabled = false;
		updateCenterButtonState();
	} else {
		state.autoCenterEnabled = true;
		updateCenterButtonState();
		// Use zoom level 17 for car navigation - appropriate for seeing road details
		// Faster animation (250ms) for responsive feel
		centerOnLatLngWithOffset([state.userPosition[1], state.userPosition[0]], 17, {
			animate: true,
			duration: 0.25,
		});
	}
}

// Update center button visual state based on auto-follow status
function updateCenterButtonState() {
	const button = document.getElementById("center-button");
	if (!button) return;

	const label = button.querySelector(".button-label");
	if (!label) return;

	if (state.autoCenterEnabled) {
		button.title = "GPS tracking on - Click to disable";
		label.textContent = "Following";
		button.style.opacity = "1";
	} else {
		button.title = "GPS tracking off - Click to enable";
		label.textContent = "Recenter";
		button.style.opacity = "0.7";
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
	state.routeLockedIn = false;
	state.currentRouteIndex = 0;
	state.maxRouteIndexReached = 0;
	state.currentSpeed = 0;
	state.lastSpeedUpdate = 0;
	state.autoCenterEnabled = true;
	state.startMarker = null;
	state.endMarker = null;
	state.deviceHeading = null;
	state.gpsHeading = null;
	state.currentHeading = 0;
	state.lastPosition = null;
	state.voiceEnabled = false;
	state.voiceSteps = [];
	state.currentVoiceStepIndex = 0;
	state.announcedSteps.clear();

	// Reset UI
	document.getElementById("navigation-section").classList.add("hidden");
	document.getElementById("route-preview-section").classList.add("hidden");
	document.getElementById("upload-section").classList.remove("hidden");
	document.getElementById("gpx-file-input").value = "";
	document.getElementById("file-info").textContent = "";

	// Hide speed indicator
	const speedIndicator = document.getElementById("speed-indicator");
	if (speedIndicator) {
		speedIndicator.classList.add("hidden");
	}

	// Reset to test centre selection
	goBackToTestCentres();
	goBackToTestCentres();
	loadTestCentres();
}

// ============================================
// VOICE NAVIGATION FUNCTIONS (Completely Redesigned)
// ============================================

// Voice navigation state
// ============================================================================
// VOICE NAVIGATION SYSTEM - Modern Google Maps-quality implementation
// ============================================================================

/**
 * Voice Navigation State
 * Manages all voice guidance state independently from routing engine
 */
const voiceState = {
	// Core state
	isInitialized: false,
	isEnabled: false,
	isSpeaking: false,

	// Voice selection
	selectedVoice: null,

	// Navigation steps (generated from GPX route analysis)
	steps: [],
	currentStepIndex: 0,

	// Announcement tracking
	announced: new Map(), // Map of "stepIndex-threshold" -> true
	lastCheckTime: 0,
	lastUserPosition: null,

	// Performance
	checkInterval: 500, // ms between voice checks
};

/**
 * Initialize Voice Navigation System
 * Sets up UI, speech synthesis, and loads voice preferences
 */
function initVoiceNavigation() {
	// Create voice toggle button
	const voiceButton = document.createElement("button");
	voiceButton.id = "voice-button";
	voiceButton.className = "control-button with-label";
	voiceButton.title = "Toggle voice navigation";
	voiceButton.innerHTML = `
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
			<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
			<line x1="12" y1="19" x2="12" y2="23"></line>
			<line x1="8" y1="23" x2="16" y2="23"></line>
		</svg>
		<span class="button-label">Voice Off</span>
	`;

	const container = document.querySelector(".control-buttons-container");
	const previewButton = document.getElementById("toggle-preview-button");
	if (container && previewButton) {
		container.insertBefore(voiceButton, previewButton);
	}

	voiceButton.addEventListener("click", toggleVoiceNavigation);

	// Initialize speech synthesis
	initializeSpeechSynthesis();

	// Load saved preference
	const savedPref = localStorage.getItem("voiceNavigationEnabled");
	if (savedPref === "true") {
		state.voiceEnabled = true;
		updateVoiceButtonState();
	}

	console.log("✓ Voice navigation system initialized");
}

/**
 * Initialize Speech Synthesis API
 * Handles voice loading and selection (iOS/Safari compatible)
 */
function initializeSpeechSynthesis() {
	if (!window.speechSynthesis) {
		console.warn("Speech synthesis not supported on this device");
		return;
	}

	let voicesLoaded = false;

	const loadVoices = () => {
		const voices = window.speechSynthesis.getVoices();

		if (voices.length > 0 && !voicesLoaded) {
			voicesLoaded = true;

			// Prefer UK English (British), then US English, then any English
			voiceState.selectedVoice =
				voices.find(
					(v) => v.lang === "en-GB" && v.name.toLowerCase().includes("female")
				) ||
				voices.find((v) => v.lang === "en-GB") ||
				voices.find(
					(v) => v.lang === "en-US" && v.name.toLowerCase().includes("female")
				) ||
				voices.find((v) => v.lang === "en-US") ||
				voices.find((v) => v.lang.startsWith("en")) ||
				voices[0];

			console.log(
				"✓ Voice selected:",
				voiceState.selectedVoice?.name || "default"
			);
		}
	};

	// iOS/Safari needs the onvoiceschanged event
	if (speechSynthesis.onvoiceschanged !== undefined) {
		speechSynthesis.onvoiceschanged = loadVoices;
	}

	// Try loading immediately (works on most browsers)
	loadVoices();

	voiceState.isInitialized = true;
}

/**
 * Toggle Voice Navigation On/Off
 * Includes iOS audio unlock and saves preference
 */
function toggleVoiceNavigation() {
	state.voiceEnabled = !state.voiceEnabled;
	voiceState.isEnabled = state.voiceEnabled;

	// Save preference
	localStorage.setItem("voiceNavigationEnabled", state.voiceEnabled.toString());

	updateVoiceButtonState();

	if (state.voiceEnabled) {
		// CRITICAL: iOS Safari requires audio unlock in direct user gesture
		// Play silent utterance to unlock audio context
		const unlockUtterance = new SpeechSynthesisUtterance(" ");
		unlockUtterance.volume = 0.01;
		unlockUtterance.rate = 10;
		window.speechSynthesis.speak(unlockUtterance);

		// Announce activation
		setTimeout(() => {
			speak("Voice guidance on", true);
		}, 150);

		// Reset tracking
		voiceState.announced.clear();
		voiceState.currentStepIndex = 0;

		console.log("🔊 Voice navigation enabled");
	} else {
		// Cancel any ongoing speech
		if (window.speechSynthesis) {
			window.speechSynthesis.cancel();
			voiceState.isSpeaking = false;
		}

		console.log("🔇 Voice navigation disabled");
	}
}

/**
 * Update Voice Button Visual State
 */
function updateVoiceButtonState() {
	const button = document.getElementById("voice-button");
	if (!button) return;

	const label = button.querySelector(".button-label");

	if (state.voiceEnabled) {
		button.classList.add("active");
		if (label) label.textContent = "Voice On";
	} else {
		button.classList.remove("active");
		if (label) label.textContent = "Voice Off";
	}
}

/**
 * Speak Text with Speech Synthesis
 * @param {string} text - Text to speak
 * @param {boolean} immediate - If true, cancels current speech
 */
function speak(text, immediate = false) {
	if (!window.speechSynthesis || !state.voiceEnabled) {
		return;
	}

	// Cancel ongoing speech if immediate
	if (immediate) {
		window.speechSynthesis.cancel();
		voiceState.isSpeaking = false;
	}

	// Don't queue up normal announcements if already speaking
	if (voiceState.isSpeaking && !immediate) {
		console.log("⏸️ Speech busy, skipping:", text);
		return;
	}

	const utterance = new SpeechSynthesisUtterance(text);
	utterance.rate = 0.95; // Slightly slower for clarity
	utterance.pitch = 1.0;
	utterance.volume = 1.0;
	utterance.lang = "en-GB"; // British English

	if (voiceState.selectedVoice) {
		utterance.voice = voiceState.selectedVoice;
	}

	utterance.onstart = () => {
		voiceState.isSpeaking = true;
	};

	utterance.onend = () => {
		voiceState.isSpeaking = false;
	};

	utterance.onerror = (event) => {
		console.error("Speech error:", event.error);
		voiceState.isSpeaking = false;
	};

	window.speechSynthesis.speak(utterance);
	console.log("🔊", text);
}

/**
 * Generate Navigation Steps from GPX Route
 * Analyzes route geometry to detect turns and create voice instructions
 * @param {Array} routePoints - Array of {lat, lng} points from GPX
 * @returns {Array} Array of navigation steps with instructions and positions
 */
function generateNavigationSteps(routePoints) {
	if (!routePoints || routePoints.length < 3) {
		console.warn("Not enough points to generate navigation steps");
		return [];
	}

	const steps = [];
	let cumulativeDistance = 0;

	// Analyze route at regular intervals to detect significant turns
	const ANALYSIS_INTERVAL = 50; // meters - check every 50m
	const MIN_TURN_ANGLE = 30; // degrees - minimum angle to consider a turn
	const ROUNDABOUT_DETECTION_ANGLE = 270; // degrees - cumulative turn suggests roundabout

	let lastAnalysisPoint = routePoints[0];
	let lastBearing = calculateBearing(routePoints[0], routePoints[1]);
	let cumulativeTurnAngle = 0;
	let pointsSinceLastTurn = 0;

	for (let i = 1; i < routePoints.length - 1; i++) {
		const point = routePoints[i];
		const nextPoint = routePoints[i + 1];

		const distanceFromLast = calculateDistance(lastAnalysisPoint, point);
		cumulativeDistance += calculateDistance(routePoints[i - 1], point);
		pointsSinceLastTurn++;

		// Analyze at intervals or at significant points
		if (distanceFromLast >= ANALYSIS_INTERVAL || i === routePoints.length - 2) {
			const currentBearing = calculateBearing(point, nextPoint);
			let turnAngle = currentBearing - lastBearing;

			// Normalize angle to -180 to 180
			while (turnAngle > 180) turnAngle -= 360;
			while (turnAngle < -180) turnAngle += 360;

			const absTurnAngle = Math.abs(turnAngle);
			cumulativeTurnAngle += absTurnAngle;

			// Detect significant turns
			if (absTurnAngle >= MIN_TURN_ANGLE && pointsSinceLastTurn > 3) {
				// Check if this might be part of a roundabout
				const isRoundabout =
					cumulativeTurnAngle > ROUNDABOUT_DETECTION_ANGLE &&
					pointsSinceLastTurn < 30;

				let instruction = "";
				let maneuverType = "";

				if (isRoundabout) {
					// Simplified roundabout detection
					maneuverType = "roundabout";
					instruction = "At the roundabout, continue";
					cumulativeTurnAngle = 0; // Reset after roundabout
				} else {
					// Regular turn
					maneuverType = "turn";

					if (absTurnAngle >= 120) {
						// Sharp turn or U-turn
						instruction = turnAngle > 0 ? "Turn sharp right" : "Turn sharp left";
					} else if (absTurnAngle >= MIN_TURN_ANGLE) {
						// Normal turn
						instruction = turnAngle > 0 ? "Turn right" : "Turn left";
					}
				}

				if (instruction) {
					steps.push({
						position: { lat: point.lat, lng: point.lng },
						instruction: instruction,
						distance: Math.round(cumulativeDistance),
						type: maneuverType,
						angle: turnAngle,
					});

					console.log(
						`Step ${steps.length}: "${instruction}" at ${cumulativeDistance.toFixed(
							0
						)}m`
					);
				}

				lastBearing = currentBearing;
				lastAnalysisPoint = point;
				pointsSinceLastTurn = 0;
				cumulativeTurnAngle = 0;
			} else if (distanceFromLast >= ANALYSIS_INTERVAL * 2) {
				// Update bearing even if no turn
				lastBearing = currentBearing;
				lastAnalysisPoint = point;
			}
		}
	}

	// Add arrival step
	const endPoint = routePoints[routePoints.length - 1];
	steps.push({
		position: { lat: endPoint.lat, lng: endPoint.lng },
		instruction: "You have arrived at your destination",
		distance: Math.round(cumulativeDistance),
		type: "arrive",
		angle: 0,
	});

	console.log(`✓ Generated ${steps.length} navigation steps from GPX route`);
	return steps;
}

/**
 * Update Voice Navigation Based on User Position
 * Main voice guidance loop - called frequently during navigation
 * @param {Array} userPosition - [lat, lng] of user's current position
 */
function updateVoiceNavigation(userPosition) {
	if (
		!state.voiceEnabled ||
		!userPosition ||
		!voiceState.steps ||
		voiceState.steps.length === 0
	) {
		return;
	}

	// Throttle checks to improve performance (500ms interval)
	const now = Date.now();
	if (now - voiceState.lastCheckTime < voiceState.checkInterval) {
		return;
	}
	voiceState.lastCheckTime = now;

	// Find next upcoming maneuver
	let nextStep = null;
	let nextStepIndex = -1;
	let distanceToNext = Infinity;

	for (let i = voiceState.currentStepIndex; i < voiceState.steps.length; i++) {
		const step = voiceState.steps[i];
		const distance = calculateDistance(userPosition, [
			step.position.lat,
			step.position.lng,
		]);

		if (distance < distanceToNext) {
			distanceToNext = distance;
			nextStep = step;
			nextStepIndex = i;
		}

		// Only check next few steps
		if (i > voiceState.currentStepIndex + 2) break;
	}

	if (!nextStep || nextStepIndex === -1) {
		return;
	}

	// Announce at Google Maps-style thresholds
	announceAtThreshold(nextStep, nextStepIndex, distanceToNext, 500, "500m"); // Far advance
	announceAtThreshold(nextStep, nextStepIndex, distanceToNext, 200, "200m"); // Main advance
	announceAtThreshold(nextStep, nextStepIndex, distanceToNext, 50, "50m"); // Final warning

	// Check if user passed this maneuver (advance to next)
	if (distanceToNext > 100 && nextStepIndex === voiceState.currentStepIndex) {
		// Check if we're actually past it (behind us) not just far away
		if (voiceState.lastUserPosition) {
			const lastDist = calculateDistance(voiceState.lastUserPosition, [
				nextStep.position.lat,
				nextStep.position.lng,
			]);

			// If distance is increasing, we've passed it
			if (distanceToNext > lastDist + 20) {
				console.log(`✓ Passed step ${nextStepIndex}, advancing to next`);
				voiceState.currentStepIndex = nextStepIndex + 1;

				// Announce next maneuver if close
				if (nextStepIndex + 1 < voiceState.steps.length) {
					const nextNextStep = voiceState.steps[nextStepIndex + 1];
					const distToNextNext = calculateDistance(userPosition, [
						nextNextStep.position.lat,
						nextNextStep.position.lng,
					]);

					if (distToNextNext < 300) {
						speak(`Then ${nextNextStep.instruction.toLowerCase()}`, true);
					}
				}
			}
		}
	}

	voiceState.lastUserPosition = userPosition;
}

/**
 * Announce instruction at specific distance threshold
 * Prevents duplicate announcements using voiceState.announced Map
 */
function announceAtThreshold(step, stepIndex, distance, threshold, key) {
	const announceKey = `${stepIndex}-${key}`;

	// Check if within threshold and not already announced
	if (
		distance <= threshold &&
		distance > threshold * 0.7 &&
		!voiceState.announced.has(announceKey)
	) {
		voiceState.announced.set(announceKey, true);

		let message = "";

		// Format announcement based on distance
		if (threshold >= 200) {
			// Far announcement - include distance
			const roundedDist = Math.round(distance / 50) * 50; // Round to nearest 50m
			message = `In ${roundedDist} metres, ${step.instruction.toLowerCase()}`;
		} else if (threshold >= 50) {
			// Close announcement - just the instruction
			message = step.instruction;
		} else {
			// Immediate - emphasize now
			message = step.instruction;
		}

		// Use immediate mode for close announcements
		const immediate = threshold < 100;
		speak(message, immediate);

		console.log(
			`📢 Announced at ${distance.toFixed(
				0
			)}m (threshold: ${threshold}m): "${message}"`
		);
	}
}

/**
 * Load Navigation Steps for Route
 * Called when route is loaded - generates steps from GPX geometry
 * @param {Array} routePoints - GPX route points
 */
function loadNavigationSteps(routePoints) {
	if (!routePoints || routePoints.length < 2) {
		voiceState.steps = [];
		return;
	}

	// Generate steps from GPX route analysis
	voiceState.steps = generateNavigationSteps(routePoints);
	voiceState.currentStepIndex = 0;
	voiceState.announced.clear();
	voiceState.lastUserPosition = null;

	console.log(`✓ Loaded ${voiceState.steps.length} voice navigation steps`);
}

// Helper function to get ordinal number (1st, 2nd, 3rd, etc.)
function getOrdinal(num) {
	const ordinals = {
		1: "first",
		2: "second",
		3: "third",
		4: "fourth",
		5: "fifth",
		6: "sixth",
		7: "seventh",
		8: "eighth",
	};
	return ordinals[num] || `${num}th`;
}

// Convert GPX route to OSRM route with turn-by-turn instructions
async function getOSRMRouteWithSteps(routePoints) {
	if (!routePoints || routePoints.length < 2) {
		console.error("Need at least 2 points for OSRM routing");
		return null;
	}

	// Sample route to stay under OSRM's 100 coordinate limit
	const maxCoords = 100;
	let sampledPoints = routePoints;

	if (routePoints.length > maxCoords) {
		const step = Math.floor(routePoints.length / maxCoords);
		sampledPoints = routePoints.filter(
			(_, i) => i % step === 0 || i === routePoints.length - 1
		);
	}

	// Build coordinates string: lon,lat;lon,lat;...
	const coordsString = sampledPoints
		.map((point) => `${point.lng},${point.lat}`) // {lat, lng} -> lng,lat
		.join(";");

	const url = `${OSRM_API}${coordsString}?overview=full&geometries=geojson&steps=true&annotations=true&alternatives=false&banner_instructions=true&voice_instructions=true`;

	try {
		const response = await fetch(url);
		const data = await response.json();

		console.log("OSRM Response code:", data.code);
		console.log("OSRM has routes:", !!data.routes);

		if (data.code === "Ok" && data.routes && data.routes.length > 0) {
			const route = data.routes[0];

			console.log("Route legs:", route.legs?.length);
			if (route.legs && route.legs[0]) {
				console.log(
					"First leg has voice_instructions:",
					!!route.legs[0].voice_instructions
				);
				console.log("First leg has steps:", !!route.legs[0].steps);
				if (route.legs[0].steps) {
					console.log("Number of steps:", route.legs[0].steps.length);
				}
			}

			// Extract navigation steps using OSRM's voice/banner instructions
			const steps = [];

			if (route.legs) {
				for (const leg of route.legs) {
					// Use voice_instructions if available (these are distances with text)
					if (leg.voice_instructions && leg.voice_instructions.length > 0) {
						console.log("✓ Found voice_instructions from OSRM");
						for (const voiceInst of leg.voice_instructions) {
							// Skip the very first "Head" instruction
							if (
								voiceInst.announcement &&
								!voiceInst.announcement.toLowerCase().startsWith("head")
							) {
								steps.push({
									instruction: voiceInst.announcement, // Pre-made voice instruction
									location: { lat: voiceInst.location[1], lng: voiceInst.location[0] }, // Convert to {lat, lng}
									distance: voiceInst.distance_along_geometry || 0,
									distanceFromStart: voiceInst.distance_along_geometry,
								});
								console.log(
									`Voice: "${voiceInst.announcement}" at ${voiceInst.distance_along_geometry}m`
								);
							}
						}
					}

					// Always check steps as fallback or if voice_instructions wasn't useful
					if (leg.steps && steps.length === 0) {
						console.log(
							"✓ Using step-based instructions (voice_instructions not available or empty)"
						);
						for (const step of leg.steps) {
							if (step.maneuver) {
								const maneuver = step.maneuver;

								// Skip depart/arrive
								if (maneuver.type === "depart" || maneuver.type === "arrive") {
									continue;
								}

								// Get the best available instruction text
								let instruction = "";

								// Try banner instruction first (designed for display/voice)
								if (step.bannerInstructions && step.bannerInstructions.length > 0) {
									const banner = step.bannerInstructions[0];
									if (banner.primary && banner.primary.text) {
										instruction = banner.primary.text;
									}
								}

								// Fall back to maneuver instruction
								if (!instruction && maneuver.instruction) {
									instruction = maneuver.instruction;
								}

								// Last resort: build from maneuver data
								if (!instruction) {
									const type = maneuver.type;
									const modifier = maneuver.modifier || "";

									if (type === "roundabout" && maneuver.exit) {
										instruction = `Take exit ${maneuver.exit}`;
									} else if (type === "turn") {
										instruction = modifier.includes("left")
											? "Turn left"
											: modifier.includes("right")
											? "Turn right"
											: "Turn";
									} else {
										instruction = `${type} ${modifier}`.trim();
									}
								}

								steps.push({
									instruction: instruction,
									location: { lat: maneuver.location[1], lng: maneuver.location[0] }, // Convert [lon, lat] to {lat, lng}
									distance: step.distance,
									duration: step.duration,
									type: maneuver.type,
									modifier: maneuver.modifier,
									name: step.name || "",
									exit: maneuver.exit,
								});

								console.log(`Step: "${instruction}" (type: ${maneuver.type})`);
							}
						}
					}
				}
			}

			console.log(`✓ Loaded ${steps.length} navigation instructions`);

			return {
				geometry: route.geometry.coordinates.map((coord) => ({
					lat: coord[1],
					lng: coord[0],
				})),
				steps: steps,
				distance: route.distance,
				duration: route.duration,
			};
		}

		console.error("OSRM API returned no valid routes");
		return null;
	} catch (error) {
		console.error("OSRM API Error:", error);
		return null;
	}
}

// Enhance instruction with better wording, especially for roundabouts
function enhanceInstruction(maneuver, step) {
	const type = maneuver.type;
	const modifier = maneuver.modifier;
	const name = step.name || "";
	const exit = maneuver.exit;

	// Special handling for roundabouts - ALWAYS SAY EXIT NUMBER WITH DIRECTION
	if (type === "roundabout" || type === "rotary") {
		if (exit) {
			const exitWord =
				exit === 1
					? "1st"
					: exit === 2
					? "2nd"
					: exit === 3
					? "3rd"
					: exit === 4
					? "4th"
					: exit === 5
					? "5th"
					: exit === 6
					? "6th"
					: `${exit}th`;

			// Add direction based on exit number and modifier
			let direction = "";
			if (exit === 1) {
				direction = "left";
			} else if (exit === 2) {
				direction = "straight ahead";
			} else if (exit === 3) {
				direction = "right";
			} else if (exit === 4) {
				direction = "back";
			} else {
				// For exits > 4, use the modifier if available
				if (modifier?.includes("left")) {
					direction = "left";
				} else if (modifier?.includes("right")) {
					direction = "right";
				} else if (modifier?.includes("straight")) {
					direction = "straight ahead";
				}
			}

			if (direction) {
				return `${direction}, ${exitWord} exit`;
			} else {
				return `${exitWord} exit`;
			}
		} else {
			// Fallback if no exit number - this shouldn't happen but just in case
			return `Roundabout ahead`;
		}
	}

	// Handle regular turns
	if (type === "turn") {
		const direction = modifier?.includes("left")
			? "left"
			: modifier?.includes("right")
			? "right"
			: modifier;
		return `Turn ${direction}`;
	}

	// Handle slight turns / bear
	if (modifier === "slight left" || modifier === "slight right") {
		const direction = modifier.includes("left") ? "left" : "right";
		return `Keep ${direction}`;
	}

	// Handle sharp turns
	if (modifier === "sharp left" || modifier === "sharp right") {
		const direction = modifier.includes("left") ? "left" : "right";
		return `Sharp ${direction}`;
	}

	// Continue/straight
	if (type === "continue" || type === "new name") {
		return `Continue straight`;
	}

	// Fork
	if (type === "fork") {
		const direction = modifier?.includes("left")
			? "left"
			: modifier?.includes("right")
			? "right"
			: "straight";
		return `Keep ${direction}`;
	}

	// Merge
	if (type === "merge") {
		const direction = modifier?.includes("left")
			? "left"
			: modifier?.includes("right")
			? "right"
			: "";
		return `Merge ${direction}`.trim();
	}

	// On/off ramp
	if (type === "on ramp" || type === "off ramp") {
		const direction = modifier?.includes("left")
			? "left"
			: modifier?.includes("right")
			? "right"
			: "";
		return `Take the ${direction} ramp`.trim();
	}

	// Fallback to OSRM instruction
	return maneuver.instruction || `Continue ${modifier || ""}`.trim();
}

// ============================================================================
// OLD OSRM-BASED VOICE FUNCTIONS - DEPRECATED
// These functions are kept for reference but are no longer used
// The new voice navigation system (above) works directly with GPX routes
// ============================================================================

// OLD: Removed speakImmediate - functionality merged into speak()
// OLD: Removed speakNavigation - functionality merged into speak()
// OLD: Removed checkVoiceGuidance - replaced by updateVoiceNavigation()
// OLD: Removed checkArrival - functionality merged into navigation steps

// The new system eliminates OSRM dependency and provides:
// - Direct GPX route analysis
// - Google Maps-quality timing (500m, 200m, 50m)
// - No duplicate announcements
// - Better performance with throttled checks
// - Cleaner, more maintainable code
