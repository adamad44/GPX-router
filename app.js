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
	lastRotationUpdateTime: 0, // throttle rotation updates
};

// Constants
const LOOK_AHEAD_DISTANCE = 1609.34; // 1 mile in meters
const START_POINT_THRESHOLD = 50; // 50 meters to consider "reached start"
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
		centerOnLatLngWithOffset(
			[longitude, latitude],
			Math.max(state.map.getZoom(), 16),
			{
				duration: duration,
			}
		);
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

	if (state.rotationMode === "compass") {
		// Compass mode logic remains the same
		if (typeof state.deviceHeading === "number" && !isNaN(state.deviceHeading)) {
			heading = state.deviceHeading;
		} else if (typeof state.gpsHeading === "number" && !isNaN(state.gpsHeading)) {
			heading = state.gpsHeading;
		}
		if (heading !== null) {
			heading = smoothHeading(heading, state.smoothedHeading, 0.3);
		}
	} else if (state.rotationMode === "route" && state.userPosition) {
		// Route-up: derive heading from route geometry with a short lookahead for stability
		let activeRoute = state.hasReachedStart
			? state.gpxRoute
			: state.approachRoute;
		if (activeRoute && activeRoute.length > 1) {
			const progress = findNearestPointOnRoute(state.userPosition, activeRoute);
			// Compute a lookahead-based bearing (e.g., 40m ahead) for smoother orientation
			heading = computeRouteHeading(activeRoute, progress.index, 40);
		}
		// Fallback to GPS heading if route-based heading fails
		if (
			heading === null &&
			typeof state.gpsHeading === "number" &&
			!isNaN(state.gpsHeading)
		) {
			heading = state.gpsHeading;
		}
		// Apply smoothing for route mode as well (reduces abrupt jumps at bends)
		if (heading !== null) {
			heading = smoothHeading(heading, state.smoothedHeading || heading, 0.25);
		}
	}

	if (heading === null || isNaN(heading)) {
		return;
	}

	// Throttle rotation updates to ~6 FPS to avoid animation queue saturation
	const now = performance.now ? performance.now() : Date.now();
	if (now - state.lastRotationUpdateTime < 150) {
		return; // Skip if too soon
	}
	state.lastRotationUpdateTime = now;

	state.smoothedHeading = heading;
	state.currentHeading = heading;
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

	// Use a smooth easeTo for ALL rotation modes to prevent jerky movements.
	// A short duration keeps it feeling responsive.
	state.map.easeTo({
		bearing: angleDeg,
		duration: 250, // A quick but smooth 250ms animation
		easing: (t) => t, // Linear easing for a consistent rotation speed
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
		// Update marker position and rotation
		state.userMarker.setLngLat([lon, lat]);
		const markerEl = state.userMarker.getElement();
		const wrapper = markerEl.querySelector(".user-marker-wrapper");
		if (wrapper) {
			wrapper.style.transform = `rotate(${arrowRotation}deg)`;
		}

		// Update accuracy circle
		if (state.map.getSource("user-accuracy")) {
			state.map.getSource("user-accuracy").setData({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [lon, lat],
				},
			});

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
				`In ${distanceRounded} meters, ${step.instruction}`,
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
			`In ${distanceRounded} meters, ${step.instruction}`,
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
		// Just repeat the instruction
		speakNavigation(step.instruction, "normal");
		state.announcedSteps.add(imminentKey);
		voiceState.lastAnnouncedStep = closestStepIndex;
		voiceState.lastAnnouncedDistance = distance;
		return;
	}

	// 4. Final "now" instruction (30m)
	if (distance <= NOW && !state.announcedSteps.has(nowKey)) {
		speakNavigation(step.instruction, "high");
		state.announcedSteps.add(nowKey);
		voiceState.lastAnnouncedStep = closestStepIndex;
		voiceState.lastAnnouncedDistance = distance;

		// Move to next step
		state.currentVoiceStepIndex = closestStepIndex + 1;
		return;
	}

	// 5. Check if we've just passed a turn and should announce the NEXT turn immediately
	// This detects when we're past the current step (behind us) and announces the next one
	if (closestStepIndex > 0 && state.currentVoiceStepIndex > 0) {
		const previousStepIndex = closestStepIndex - 1;
		if (previousStepIndex >= 0 && previousStepIndex < state.voiceSteps.length) {
			const prevStep = state.voiceSteps[previousStepIndex];
			const prevLocation = [prevStep.location[1], prevStep.location[0]];
			const distanceToPrev = calculateDistance(state.userPosition, prevLocation);

			// If we're 20-80m past the previous turn, announce the next turn immediately
			const justPassedKey = `${closestStepIndex}-justpassed`;
			if (
				distanceToPrev < 80 &&
				distanceToPrev > 20 &&
				!state.announcedSteps.has(justPassedKey) &&
				distance < 500
			) {
				// Only if next turn is within 500m
				// Check that we're actually past it (behind us)
				speakNavigation(step.instruction, "high");
				state.announcedSteps.add(justPassedKey);
				console.log(
					`✓ Just passed turn, immediately announcing next: ${step.instruction}`
				);
			}
		}
	}

	// If we've passed this step (more than 300m past), move to next
	if (distance > 300 && closestStepIndex === voiceState.lastAnnouncedStep) {
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
