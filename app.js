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
	lastBearing: 0, // For stable rotation
	smoothedHeading: 0, // Smoothed heading for rotation
	lastPosition: null,
	orientationListenerActive: false,
	deviceHeading: null,
	gpsHeading: null,
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
	simulationSpeed: 0, // in km/h
	simulationInterval: null,
	simulatedPosition: null,
	currentSimulatedSegmentIndex: 0,
	distanceIntoSegment: 0, // in meters
};

// Constants
const LOOK_AHEAD_DISTANCE = 1609.34; // 1 mile in meters
const START_POINT_THRESHOLD = 50; // 50 meters to consider "reached start"
const OSRM_API = "https://router.project-osrm.org/route/v1/driving/";
const USER_VIEW_OFFSET_RATIO = 0.4; // keep user marker near bottom of screen (increased from 0.28)

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
			processNewPosition(state.simulatedPosition[0], state.simulatedPosition[1]);
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

	const speedMetersPerSecond = (state.simulationSpeed * 1000) / 3600;
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

	// Update the map with the new simulated position
	processNewPosition(
		state.simulatedPosition[0],
		state.simulatedPosition[1],
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
	const lat = p1[0] + (p2[0] - p1[0]) * fraction;
	const lon = p1[1] + (p2[1] - p1[1]) * fraction;
	return [lat, lon];
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

		// Get OSRM route with voice instructions
		console.log("Fetching turn-by-turn instructions from OSRM...");
		const osrmRoute = await getOSRMRouteWithSteps(state.gpxRoute);
		if (osrmRoute && osrmRoute.steps) {
			state.voiceSteps = osrmRoute.steps;
			state.currentVoiceStepIndex = 0;
			state.announcedSteps.clear();
			console.log(`✓ Loaded ${osrmRoute.steps.length} navigation steps`);
		} else {
			console.warn("Could not get voice instructions from OSRM");
			state.voiceSteps = [];
		}

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

		state.previewMap = L.map("preview-map", {
			zoomControl: true,
			attributionControl: true,
		});

		L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		}).addTo(state.previewMap);

		const routePolyline = L.polyline(points, {
			color: "#3b82f6",
			weight: 5,
		}).addTo(state.previewMap);

		const startIcon = L.divIcon({
			className: "custom-marker",
			html: `<div style="background: #28a745; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
			iconSize: [24, 24],
			iconAnchor: [12, 12],
		});

		const endIcon = L.divIcon({
			className: "custom-marker",
			html: `<div style="background: #dc3545; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
			iconSize: [24, 24],
			iconAnchor: [12, 12],
		});

		L.marker(points[0], { icon: startIcon }).addTo(state.previewMap);
		L.marker(points[points.length - 1], { icon: endIcon }).addTo(
			state.previewMap
		);

		state.previewMap.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });
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

		// Get OSRM route with voice instructions
		console.log("Fetching turn-by-turn instructions from OSRM...");
		const osrmRoute = await getOSRMRouteWithSteps(state.gpxRoute);
		if (osrmRoute && osrmRoute.steps) {
			state.voiceSteps = osrmRoute.steps;
			state.currentVoiceStepIndex = 0;
			state.announcedSteps.clear();
			console.log(`✓ Loaded ${osrmRoute.steps.length} navigation steps`);
		} else {
			console.warn("Could not get voice instructions from OSRM");
			state.voiceSteps = [];
		}

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

	// Get OSRM route with voice instructions
	(async () => {
		console.log("Fetching turn-by-turn instructions from OSRM...");
		const osrmRoute = await getOSRMRouteWithSteps(state.gpxRoute);
		if (osrmRoute && osrmRoute.steps) {
			state.voiceSteps = osrmRoute.steps;
			state.currentVoiceStepIndex = 0;
			state.announcedSteps.clear();
			console.log(`✓ Loaded ${osrmRoute.steps.length} navigation steps`);
		} else {
			console.warn("Could not get voice instructions from OSRM");
			state.voiceSteps = [];
		}
	})();

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

		// Get OSRM route with voice instructions
		console.log("Fetching turn-by-turn instructions from OSRM...");
		const osrmRoute = await getOSRMRouteWithSteps(gpxData);
		if (osrmRoute && osrmRoute.steps) {
			state.voiceSteps = osrmRoute.steps;
			state.currentVoiceStepIndex = 0;
			state.announcedSteps.clear();
			console.log(`✓ Loaded ${osrmRoute.steps.length} navigation steps`);
		} else {
			console.warn("Could not get voice instructions from OSRM");
			state.voiceSteps = [];
		}

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
	document.getElementById("route-preview-section").classList.add("hidden");
	document.getElementById("navigation-section").classList.remove("hidden");

	// Initialize map if not already done
	if (!state.map) {
		initializeMap();
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
			processNewPosition(state.simulatedPosition[0], state.simulatedPosition[1]);
		}
	} else {
		showLocationModal();
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

	// Request compass access immediately while we're still in a user gesture (iOS requirement)
	// This ensures we always have compass data for the direction arrow
	enableDeviceCompass();

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

	// Add OpenStreetMap tile layer optimized for navigation
	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
		updateCenterButtonState();
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

	// Update or create user marker
	updateUserMarker(latitude, longitude, accuracy);

	// Rotate map if rotation mode is enabled
	if (state.rotationMode !== "off") {
		applyMapRotation();
	}

	// Center map on user if auto-center is enabled
	if (state.autoCenterEnabled) {
		// Use faster centering in compass mode for more responsive tracking
		const duration = state.rotationMode === "compass" ? 0.15 : 0.5;
		centerOnLatLngWithOffset([latitude, longitude], state.map.getZoom() || 16, {
			duration: duration,
			easeLinearity: 0.5
		});
	}

	// Update navigation
	updateNavigation();

	// Check voice guidance
	checkVoiceGuidance();
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
		// Always update current heading for the arrow, regardless of rotation mode
		state.currentHeading = headingDeg;

		// Update the user marker to show the new heading
		if (state.userPosition && state.userMarker) {
			updateUserMarker(
				state.userPosition[0],
				state.userPosition[1],
				state.userAccuracyCircle ? state.userAccuracyCircle.getRadius() : 10
			);
		}

		// Apply map rotation only if in compass mode
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

	// Compass mode: prioritize device orientation
	if (state.rotationMode === "compass") {
		if (typeof state.deviceHeading === "number" && !isNaN(state.deviceHeading)) {
			heading = state.deviceHeading;
		} else if (typeof state.gpsHeading === "number" && !isNaN(state.gpsHeading)) {
			heading = state.gpsHeading;
		}

		// Apply light smoothing for compass mode (30% of the change)
		if (heading !== null) {
			heading = smoothHeading(heading, state.smoothedHeading, 0.3);
		}
	}

	// Route mode: use the direction of the ACTIVE navigation route
	if (state.rotationMode === "route" && state.userPosition) {
		let activeRoute = null;
		if (
			!state.hasReachedStart &&
			state.approachRoute &&
			state.approachRoute.length > 1
		) {
			activeRoute = state.approachRoute;
		} else if (state.gpxRoute && state.gpxRoute.length > 1) {
			activeRoute = state.gpxRoute;
		}

		if (activeRoute) {
			const progress = findNearestPointOnRoute(state.userPosition, activeRoute);
			// Look much further ahead (100-150m) for very stable bearing on straights and gentle curves
			const lookAheadDistance = Math.max(
				100,
				Math.min(150, state.simulationSpeed)
			);
			const lookAheadPoint = getPointAhead(
				activeRoute,
				progress.index,
				lookAheadDistance
			);

			if (lookAheadPoint) {
				heading = calculateBearing(state.userPosition, lookAheadPoint);
			}
		}

		// Fallback to GPS heading if route-based heading fails
		if (
			heading === null &&
			typeof state.gpsHeading === "number" &&
			!isNaN(state.gpsHeading)
		) {
			heading = state.gpsHeading;
		}

		// Apply moderate smoothing for route mode (50% of the change for responsive but smooth transitions)
		if (heading !== null) {
			heading = smoothHeading(heading, state.smoothedHeading, 0.5);
		}
	}

	if (heading === null || isNaN(heading)) {
		return;
	}

	// Update smoothed heading for next iteration
	state.smoothedHeading = heading;
	state.currentHeading = heading;

	// Rotate map so that heading points up
	setMapBearing(-state.currentHeading);
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

// Set map bearing using plugin if available
function setMapBearing(angleDeg) {
	if (!state.map) return;

	const rotationOptions = {
		animate: true,
		duration: 0.2, // Quick, responsive animation
		easeLinearity: 0.3, // Smooth easing for natural feel
	};

	// In compass mode, rotate around the user's location (the anchor point)
	if (state.rotationMode === "compass" && state.userPosition) {
		const anchor = state.map.latLngToContainerPoint(state.userPosition);
		state.map.setBearing(angleDeg, { ...rotationOptions, anchor });
	} else {
		state.map.setBearing(angleDeg, rotationOptions);
	}
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
	let mapBearing = 0;
	if (state.map) {
		if (typeof state.map.getBearing === "function") {
			mapBearing = state.map.getBearing();
		}
	}

	// Counter-rotate the arrow so it points true north relative to the screen
	// When map rotates clockwise, arrow needs to rotate counter-clockwise by the same amount
	const arrowRotation = displayHeading - mapBearing;

	// Create custom user marker icon with heading indicator
	const userIcon = L.divIcon({
		className: "user-marker-container",
		iconSize: [40, 40],
		iconAnchor: [20, 20],
		html: `
			<div class="user-marker-wrapper" style="transform: rotate(${arrowRotation}deg)">
				<div class="user-marker-arrow"></div>
				<div class="user-marker-dot"></div>
			</div>
		`,
	});

	if (!state.userMarker) {
		state.userMarker = L.marker([lat, lon], {
			icon: userIcon,
			rotationAngle: 0,
			rotationOrigin: "center",
		}).addTo(state.map);
		state.userAccuracyCircle = L.circle([lat, lon], {
			radius: accuracy,
			className: "user-accuracy",
			interactive: false,
		}).addTo(state.map);
	} else {
		state.userMarker.setLatLng([lat, lon]);
		state.userMarker.setIcon(userIcon);
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
			if (data.routes && data.routes.length > 0) {
				const route = data.routes[0];
				const coordinates = route.geometry.coordinates;

				// Convert [lon, lat] to [lat, lon]
				return coordinates.map((coord) => [coord[1], coord[0]]);
			}
			return null; // Convert [lon, lat] to [lat, lon]
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

	// Get the current map bearing (rotation angle in degrees)
	const bearing = map.getBearing ? map.getBearing() : 0;
	const bearingRad = (bearing * Math.PI) / 180;

	// Project the GPS position to pixel coordinates at the target zoom
	const projected = map.project(latlng, targetZoom);

	// Apply offset accounting for map rotation
	// When map is rotated, we need to rotate the offset vector as well
	// Offset should always be "down" in screen space (positive Y in screen coordinates)
	const offsetX = offsetY * Math.sin(bearingRad);
	const offsetY_rotated = offsetY * Math.cos(bearingRad);

	const offsetPoint = L.point(
		projected.x - offsetX,
		projected.y - offsetY_rotated
	);
	const centerLatLng = map.unproject(offsetPoint, targetZoom);

	// Default animation settings (can be overridden by animationOptions)
	const defaultAnimation = {
		animate: true,
		duration: 0.5,
		easeLinearity: 0.2,
	};

	map.setView(centerLatLng, targetZoom, {
		...defaultAnimation,
		...animationOptions,
	});
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
		centerOnLatLngWithOffset(state.userPosition, 17, {
			animate: true,
			duration: 0.5,
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

	// Reset to test centre selection
	goBackToTestCentres();
	goBackToTestCentres();
	loadTestCentres();
}

// ============================================
// VOICE NAVIGATION FUNCTIONS (Completely Redesigned)
// ============================================

// Voice navigation state
const voiceState = {
	isInitialized: false,
	isSpeaking: false,
	selectedVoice: null,
	lastAnnouncedStep: -1,
	lastAnnouncedDistance: null,
	repeatCount: 0,
};

// Initialize voice navigation button
function initVoiceNavigation() {
	const voiceButton = document.createElement("button");
	voiceButton.id = "voice-button";
	voiceButton.className = "control-button with-label";
	voiceButton.title = "Turn voice directions on/off";
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
	container.insertBefore(voiceButton, previewButton);

	voiceButton.addEventListener("click", toggleVoiceNavigation);
	updateVoiceButtonState();

	// Initialize speech synthesis
	initializeSpeechSynthesis();
}

// Initialize speech synthesis properly for iOS/Safari
function initializeSpeechSynthesis() {
	if (!window.speechSynthesis) {
		console.warn("Speech synthesis not supported");
		return;
	}

	// Load voices
	let voicesLoaded = false;

	const loadVoices = () => {
		const voices = window.speechSynthesis.getVoices();
		if (voices.length > 0 && !voicesLoaded) {
			voicesLoaded = true;

			// Select best voice (prefer UK English, then US English)
			voiceState.selectedVoice =
				voices.find((v) => v.lang === "en-GB" && v.name.includes("Female")) ||
				voices.find((v) => v.lang === "en-GB") ||
				voices.find(
					(v) => v.lang.startsWith("en-US") && v.name.includes("Female")
				) ||
				voices.find((v) => v.lang.startsWith("en-US")) ||
				voices.find((v) => v.lang.startsWith("en")) ||
				voices[0];

			console.log(
				"✓ Voice selected:",
				voiceState.selectedVoice?.name || "default"
			);
		}
	};

	// iOS needs the onvoiceschanged event
	if (speechSynthesis.onvoiceschanged !== undefined) {
		speechSynthesis.onvoiceschanged = loadVoices;
	}

	// Also try loading immediately
	loadVoices();

	// iOS/Safari requires user interaction to unlock audio
	// This will be called when user clicks the voice button
	voiceState.isInitialized = true;
}

// Toggle voice navigation on/off
function toggleVoiceNavigation() {
	state.voiceEnabled = !state.voiceEnabled;
	updateVoiceButtonState();

	if (state.voiceEnabled) {
		// CRITICAL: Unlock speech synthesis with immediate user gesture
		// iOS Safari requires this to happen synchronously in the click handler
		const unlockUtterance = new SpeechSynthesisUtterance(" ");
		unlockUtterance.volume = 0.01; // Nearly silent
		unlockUtterance.rate = 10; // Very fast
		window.speechSynthesis.speak(unlockUtterance);

		// Now announce that voice is enabled
		setTimeout(() => {
			speakImmediate("Voice guidance on");
		}, 200);

		// Reset tracking
		voiceState.lastAnnouncedStep = -1;
		voiceState.lastAnnouncedDistance = null;
		state.announcedSteps.clear();

		console.log("🔊 Voice navigation enabled");
	} else {
		// Cancel any ongoing speech
		if (window.speechSynthesis) {
			window.speechSynthesis.cancel();
		}
		speakImmediate("Voice guidance off");
		console.log("🔇 Voice navigation disabled");
	}
}

// Update voice button appearance
function updateVoiceButtonState() {
	const button = document.getElementById("voice-button");
	if (!button) return;

	const label = button.querySelector(".button-label");
	if (!label) return;

	if (state.voiceEnabled) {
		button.classList.add("active");
		label.textContent = "Voice On";
	} else {
		button.classList.remove("active");
		label.textContent = "Voice Off";
	}
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
		.map((point) => `${point[1]},${point[0]}`) // [lat, lon] -> lon,lat
		.join(";");

	const url = `${OSRM_API}${coordsString}?overview=full&geometries=geojson&steps=true&annotations=true&alternatives=false`;

	try {
		const response = await fetch(url);
		const data = await response.json();

		if (data.code === "Ok" && data.routes && data.routes.length > 0) {
			const route = data.routes[0];

			// Extract and enhance navigation steps
			const steps = [];

			if (route.legs) {
				for (const leg of route.legs) {
					if (leg.steps) {
						for (const step of leg.steps) {
							if (step.maneuver) {
								const maneuver = step.maneuver;
								const instruction = maneuver.instruction || "";

								// Skip "depart" and "arrive" instructions - we'll handle these separately
								if (maneuver.type === "depart" || maneuver.type === "arrive") {
									continue;
								}

								steps.push({
									instruction: instruction,
									enhancedInstruction: enhanceInstruction(maneuver, step),
									location: maneuver.location, // [lon, lat]
									distance: step.distance, // meters to next maneuver
									duration: step.duration,
									type: maneuver.type,
									modifier: maneuver.modifier,
									name: step.name || "",
									exit: maneuver.exit, // For roundabouts
								});
							}
						}
					}
				}
			}

			console.log(`✓ Loaded ${steps.length} navigation instructions`);

			return {
				geometry: route.geometry.coordinates.map((coord) => [coord[1], coord[0]]),
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

	// Special handling for roundabouts
	if (type === "roundabout" || type === "rotary") {
		if (exit) {
			const exitWord =
				exit === 1
					? "first"
					: exit === 2
					? "second"
					: exit === 3
					? "third"
					: exit === 4
					? "fourth"
					: exit === 5
					? "fifth"
					: `exit number ${exit}`;

			if (name) {
				return `At the roundabout, take the ${exitWord} exit onto ${name}`;
			} else {
				return `At the roundabout, take the ${exitWord} exit`;
			}
		} else {
			return `Enter the roundabout and follow signs${name ? " for " + name : ""}`;
		}
	}

	// Handle regular turns
	if (type === "turn") {
		const direction = modifier?.includes("left")
			? "left"
			: modifier?.includes("right")
			? "right"
			: modifier;
		if (name) {
			return `Turn ${direction} onto ${name}`;
		}
		return `Turn ${direction}`;
	}

	// Handle slight turns / bear
	if (modifier === "slight left" || modifier === "slight right") {
		const direction = modifier.includes("left") ? "left" : "right";
		if (name) {
			return `Bear ${direction} onto ${name}`;
		}
		return `Bear ${direction}`;
	}

	// Handle sharp turns
	if (modifier === "sharp left" || modifier === "sharp right") {
		const direction = modifier.includes("left") ? "left" : "right";
		if (name) {
			return `Sharp ${direction} onto ${name}`;
		}
		return `Sharp ${direction}`;
	}

	// Continue/straight
	if (type === "continue" || type === "new name") {
		if (name) {
			return `Continue onto ${name}`;
		}
		return `Continue straight`;
	}

	// Fork
	if (type === "fork") {
		const direction = modifier?.includes("left")
			? "left"
			: modifier?.includes("right")
			? "right"
			: "straight";
		if (name) {
			return `At the fork, keep ${direction} onto ${name}`;
		}
		return `At the fork, keep ${direction}`;
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

// Speak text immediately (for confirmations)
function speakImmediate(text) {
	if (!window.speechSynthesis) {
		return;
	}

	// Cancel any ongoing speech
	window.speechSynthesis.cancel();
	voiceState.isSpeaking = false;

	const utterance = new SpeechSynthesisUtterance(text);
	utterance.rate = 1.0;
	utterance.pitch = 1.0;
	utterance.volume = 1.0;

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
		console.error("Speech error:", event);
		voiceState.isSpeaking = false;
	};

	window.speechSynthesis.speak(utterance);
	console.log("🔊", text);
}

// Speak navigation instruction with distance
function speakNavigation(text, priority = "normal") {
	if (!window.speechSynthesis || !state.voiceEnabled) {
		return;
	}

	// For high priority (imminent turns), cancel ongoing speech
	if (priority === "high") {
		window.speechSynthesis.cancel();
		voiceState.isSpeaking = false;
	}

	// Don't interrupt ongoing speech for normal priority
	if (voiceState.isSpeaking && priority === "normal") {
		console.log("⏸️ Speech busy, skipping:", text);
		return;
	}

	const utterance = new SpeechSynthesisUtterance(text);
	utterance.rate = 0.95; // Slightly slower for clarity
	utterance.pitch = 1.0;
	utterance.volume = 1.0;

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
		console.error("Speech error:", event);
		voiceState.isSpeaking = false;
	};

	window.speechSynthesis.speak(utterance);
	console.log("🔊", text);
}

// Check if we should announce upcoming maneuvers
function checkVoiceGuidance() {
	if (
		!state.voiceEnabled ||
		!state.userPosition ||
		!state.voiceSteps ||
		state.voiceSteps.length === 0
	) {
		return;
	}

	// Distance thresholds for announcements
	const LONG_ADVANCE = 500; // 500m - early warning
	const ADVANCE = 200; // 200m - main instruction
	const IMMINENT = 75; // 75m - "prepare to turn"
	const NOW = 30; // 30m - final instruction

	// Find the closest upcoming step
	let closestStepIndex = -1;
	let closestDistance = Infinity;

	for (let i = state.currentVoiceStepIndex; i < state.voiceSteps.length; i++) {
		const step = state.voiceSteps[i];
		const stepLocation = [step.location[1], step.location[0]]; // [lon, lat]
		const distance = calculateDistance(state.userPosition, stepLocation);

		if (distance < closestDistance) {
			closestDistance = distance;
			closestStepIndex = i;
		}

		// Only check next few steps to avoid looking too far ahead
		if (i > state.currentVoiceStepIndex + 3) break;
	}

	if (closestStepIndex === -1) {
		// Check if we've arrived
		checkArrival();
		return;
	}

	const step = state.voiceSteps[closestStepIndex];
	const distance = closestDistance;

	// Create unique announcement keys
	const longKey = `${closestStepIndex}-long`;
	const advanceKey = `${closestStepIndex}-advance`;
	const imminentKey = `${closestStepIndex}-imminent`;
	const nowKey = `${closestStepIndex}-now`;

	// 1. Long advance notice (500m) - only for significant turns
	if (
		distance <= LONG_ADVANCE &&
		distance > ADVANCE &&
		!state.announcedSteps.has(longKey)
	) {
		// Only announce long advance for major maneuvers (not slight adjustments)
		if (
			step.type === "roundabout" ||
			step.type === "rotary" ||
			(step.type === "turn" && !step.modifier?.includes("slight"))
		) {
			const distanceRounded = Math.round(distance / 50) * 50;
			speakNavigation(
				`In ${distanceRounded} meters, ${step.enhancedInstruction}`,
				"normal"
			);
			state.announcedSteps.add(longKey);
			voiceState.lastAnnouncedStep = closestStepIndex;
			voiceState.lastAnnouncedDistance = distance;
		}
		return;
	}

	// 2. Main advance notice (200m)
	if (
		distance <= ADVANCE &&
		distance > IMMINENT &&
		!state.announcedSteps.has(advanceKey)
	) {
		const distanceRounded = Math.round(distance / 25) * 25;
		speakNavigation(
			`In ${distanceRounded} meters, ${step.enhancedInstruction}`,
			"normal"
		);
		state.announcedSteps.add(advanceKey);
		voiceState.lastAnnouncedStep = closestStepIndex;
		voiceState.lastAnnouncedDistance = distance;
		return;
	}

	// 3. Imminent notice (75m) - "prepare to..."
	if (
		distance <= IMMINENT &&
		distance > NOW &&
		!state.announcedSteps.has(imminentKey)
	) {
		// For roundabouts, repeat the exit instruction
		if (step.type === "roundabout" || step.type === "rotary") {
			speakNavigation(`Prepare to ${step.enhancedInstruction}`, "normal");
		} else {
			speakNavigation(`Prepare to ${step.enhancedInstruction}`, "normal");
		}
		state.announcedSteps.add(imminentKey);
		voiceState.lastAnnouncedStep = closestStepIndex;
		voiceState.lastAnnouncedDistance = distance;
		return;
	}

	// 4. Final "now" instruction (30m)
	if (distance <= NOW && !state.announcedSteps.has(nowKey)) {
		speakNavigation(step.enhancedInstruction, "high");
		state.announcedSteps.add(nowKey);
		voiceState.lastAnnouncedStep = closestStepIndex;
		voiceState.lastAnnouncedDistance = distance;

		// Move to next step
		state.currentVoiceStepIndex = closestStepIndex + 1;
		return;
	}

	// If we've passed this step (more than 100m past), move to next
	if (distance > 100 && closestStepIndex === voiceState.lastAnnouncedStep) {
		state.currentVoiceStepIndex = closestStepIndex + 1;
		console.log(`✓ Passed step ${closestStepIndex}, moving to next`);
	}
}

// Check if user has arrived at destination
function checkArrival() {
	if (!state.gpxRoute || state.gpxRoute.length === 0) return;

	const endPoint = state.gpxRoute[state.gpxRoute.length - 1];
	const distanceToEnd = calculateDistance(state.userPosition, endPoint);

	// Announce when within 100m of destination
	if (distanceToEnd < 100 && !state.announcedSteps.has("arriving")) {
		speakNavigation(
			`Arriving at destination in ${Math.round(distanceToEnd)} meters`,
			"normal"
		);
		state.announcedSteps.add("arriving");
	}

	// Announce arrival when within 30m
	if (distanceToEnd < 30 && !state.announcedSteps.has("arrival")) {
		speakNavigation("You have arrived at your destination", "high");
		state.announcedSteps.add("arrival");
	}
}
