// DOM Elements
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const cameraBtn = document.getElementById('camera-btn');
const cameraPreview = document.getElementById('camera-preview');
const captureBtn = document.getElementById('capture-btn');
const stopCameraBtn = document.getElementById('stop-camera-btn');
const detectBtn = document.getElementById('detect-btn');
const imagePreview = document.getElementById('image-preview');
const resultsDisplay = document.getElementById('results-display');
const emptyResults = document.getElementById('empty-results');
const predictionResult = document.getElementById('prediction-result');
const confidenceLevel = document.getElementById('confidence-level');
const confidenceValue = document.getElementById('confidence-value');
const confidenceDisplay = document.getElementById('confidence-display');
const recommendBtn = document.getElementById('recommend-btn');
const recommendations = document.getElementById('recommendations');
const diseaseInfoBox = document.getElementById('disease-info');
const diseaseDescription = document.getElementById('disease-description');
const moreInfoBtn = document.getElementById('more-info-btn');
const showConfidenceBtn = document.getElementById('show-confidence-btn'); // Added
const detectText = document.getElementById('detect-text'); // Added for spinner
const detectSpinner = document.getElementById('detect-spinner'); // Added for spinner

// System Variables
let currentFile = null;
let cameraStream = null;
let currentDisease = null;
let lastPredictionData = null;

// Initialize Event Listeners
function initEventListeners() {
    // File Upload
    if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    // Camera Functionality
    if (cameraBtn) cameraBtn.addEventListener('click', startCamera);
    if (captureBtn) captureBtn.addEventListener('click', captureImage);
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);
    
    // Detection
    if (detectBtn) detectBtn.addEventListener('click', predictDisease);
    if (recommendBtn) recommendBtn.addEventListener('click', getRecommendations);
    if (moreInfoBtn) moreInfoBtn.addEventListener('click', showDiseaseInfo);
    
    // Confidence Button
    if (showConfidenceBtn) { // Added
        showConfidenceBtn.addEventListener('click', toggleConfidenceDisplay);
    }
    
    // Drag and Drop
    if (dropArea) setupDragAndDrop();
}

// Drag and Drop Setup
function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    dropArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    dropArea.classList.add('highlight');
}

function unhighlight() {
    dropArea.classList.remove('highlight');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        // Create a fake event object
        handleFileSelect({ target: { files } });
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.match('image.*')) {
        stopCamera();
        currentFile = file;
        displayImage(file);
        enableDetection();
    } else {
        console.error("Invalid file type selected");
        alert("Please select a valid image file (JPG, PNG, JPEG)");
    }
}

function displayImage(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        imagePreview.innerHTML = `
            <img src="${e.target.result}" class="preview-image" alt="Preview">
            <p class="image-name">${file.name}</p>
        `;
    };
    reader.readAsDataURL(file);
}

async function startCamera() {
    try {
        // Clear existing uploads
        if (imagePreview) imagePreview.innerHTML = '';
        currentFile = null;
        if (fileInput) fileInput.value = '';
        if (detectBtn) detectBtn.disabled = true;
        
        // Stop any existing camera stream
        stopCamera();
        
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        document.querySelector('.camera-section').classList.remove('d-none');
        cameraPreview.srcObject = cameraStream;
        
    } catch (err) {
        console.error("Camera error:", err);
        alert("Could not access camera: " + err.message);
    }
}

function captureImage() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = cameraPreview.videoWidth;
    canvas.height = cameraPreview.videoHeight;
    ctx.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(blob => {
        currentFile = new File([blob], `capture_${Date.now()}.jpg`, {
            type: 'image/jpeg'
        });
        
        displayImage(currentFile);
        stopCamera();
        enableDetection();
    }, 'image/jpeg', 0.95);
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    const cameraSection = document.querySelector('.camera-section');
    if (cameraSection) cameraSection.classList.add('d-none');
}

function enableDetection() {
    if (detectBtn) detectBtn.disabled = false;
}

async function predictDisease() {
    if (!currentFile) return;
    
    detectBtn.disabled = true;
    detectText.classList.add('d-none'); // Show spinner
    detectSpinner.classList.remove('d-none');
    
    try {
        const formData = new FormData();
        formData.append('file', currentFile);

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        // Store all prediction data
        lastPredictionData = data;
        displayResults(data);
   } catch (error) {
        alert("Prediction error: " + error.message);
    } finally {
        detectBtn.disabled = false;
        detectText.classList.remove('d-none'); // Hide spinner
        detectSpinner.classList.add('d-none');
    }
}

function displayResults(data) {
    if (!emptyResults || !resultsDisplay) return;
    
    emptyResults.classList.add('d-none');
    resultsDisplay.classList.remove('d-none');
    
    currentDisease = data.result;
    
    // Define color mapping for diseases
    const colorMap = {
        'Blight': 'warning',
        'Common Rust': 'warning',
        'Gray Leaf Spot': 'warning',
        'Streak Virus': 'danger',
        'Healthy': 'success',
        'Non Maize': 'secondary'
    };
    
    const diseaseColor = colorMap[data.result] || 'danger';
    const alertClass = `alert-${diseaseColor}`;
    
    predictionResult.className = `alert ${alertClass}`;
    predictionResult.innerHTML = `<strong>${currentDisease}</strong>`;
    
    // Update confidence display
    const confidencePercent = (data.confidence * 100).toFixed(1);
    confidenceLevel.style.width = `${confidencePercent}%`;
    confidenceValue.textContent = `${confidencePercent}%`;
    
    // Set color for confidence bar
    const colorValueMap = {
        'success': '#27ae60',
        'warning': '#f39c12',
        'danger': '#e74c3c',
        'secondary': '#6c757d'
    };
    confidenceLevel.style.backgroundColor = colorValueMap[diseaseColor] || '#e74c3c';
    
    // Show disease information
    diseaseDescription.textContent = data.description;
    diseaseInfoBox.className = `disease-info-box mt-3 p-3 disease-${diseaseColor}`;
    diseaseInfoBox.classList.remove('d-none');
    
    // Clear recommendations
    recommendations.innerHTML = '';
}

function showDiseaseInfo() {
    if (!lastPredictionData) return;
    
    // Create modal-like popup
    const diseaseModal = document.createElement('div');
    diseaseModal.className = 'disease-modal';
    diseaseModal.innerHTML = `
        <div class="disease-modal-content">
            <div class="disease-modal-header">
                <h4>${lastPredictionData.result} Information</h4>
                <button class="close-btn">&times;</button>
            </div>
            <div class="disease-modal-body">
                <p>${lastPredictionData.description}</p>
                <h5>Recommendations:</h5>
                <ul>
                    ${lastPredictionData.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
    
    document.body.appendChild(diseaseModal);
    
    // Close button functionality
    diseaseModal.querySelector('.close-btn').addEventListener('click', () => {
        document.body.removeChild(diseaseModal);
    });
}

function getRecommendations() {
    if (!lastPredictionData) {
        recommendations.innerHTML = `
            <div class="alert alert-warning">
                No prediction available. Please detect disease first.
            </div>
        `;
        return;
    }
    
    recommendations.innerHTML = `
        <div class="recommendations-content">
            <h5><i class="bi bi-list-check"></i> Recommendations</h5>
            <ul>
                ${lastPredictionData.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    `;
}

function toggleConfidenceDisplay() {
    confidenceDisplay.classList.toggle('d-none');
    
    // Update button text
    if (confidenceDisplay.classList.contains('d-none')) {
        showConfidenceBtn.innerHTML = '<i class="bi bi-graph-up"></i> Show Confidence Level';
    } else {
        showConfidenceBtn.innerHTML = '<i class="bi bi-graph-down"></i> Hide Confidence Level';
    }
}

// Initialise the application
document.addEventListener('DOMContentLoaded', initEventListeners);