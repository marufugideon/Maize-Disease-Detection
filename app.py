from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from werkzeug.security import generate_password_hash, check_password_hash
from tensorflow.keras.models import load_model
import numpy as np
from PIL import Image
import os
from datetime import datetime
import tensorflow as tf

app = Flask(__name__)
app.secret_key = os.urandom(24)
app.config['SESSION_COOKIE_NAME'] = 'maize_disease_session'

# Custom Attention Layer (keep this if your model requires it)
class AttentionLayer(tf.keras.layers.Layer):
    def __init__(self, **kwargs):
        super(AttentionLayer, self).__init__(**kwargs)

    def build(self, input_shape):
        self.W = self.add_weight(name='attention_weights',
                               shape=(input_shape[-1], input_shape[-1]),
                               initializer='random_normal',
                               trainable=True)

    def call(self, inputs):
        scores = tf.matmul(inputs, self.W)
        scores = tf.nn.softmax(scores, axis=1)
        weighted = inputs * scores
        return tf.reduce_sum(weighted, axis=1)

# User database
users = {
    "admin": {
        "password": generate_password_hash("123"),
        "name": "Gideon Marufu",
        "email": "marufugideon@gmail.com",
        "phone": "+263786867177",
        "whatsapp": "+263786867177",
        "last_login": None
    }
}

detection_history = {}

# CORRECTED: Added specific recommendations for each disease
DISEASE_INFO = {
    "Blight": {
        "description": "Caused by fungi Exserohilum turcicum. Causes gray-green lesions on leaves.",
        "recommendations": [
            "Use resistant hybrids like SC727 or Pannar 67",
            "Rotate crops with legumes for 2 years",
            "Apply fungicides containing azoxystrobin at first symptoms",
            "Remove infected plant debris after harvest",
            "Avoid overhead irrigation to reduce leaf wetness"
        ],
        "color": "warning"
    },
    "Common Rust": {
        "description": "Fungal disease (Puccinia sorghi) showing cinnamon-brown pustules.",
        "recommendations": [
            "Plant early-maturing varieties like Seed Co 403",
            "Apply foliar fungicides with triazole compounds",
            "Avoid late planting in high-risk areas",
            "Remove volunteer maize plants between seasons",
            "Use sulfur-based fungicides for organic management"
        ],
        "color": "warning"
    },
    "Gray Leaf Spot": {
        "description": "Fungal infection (Cercospora zeae-maydis) with rectangular lesions.",
        "recommendations": [
            "Practice conservation tillage to bury infected residue",
            "Apply fungicides at V8 growth stage",
            "Space plants adequately (75cm between rows)",
            "Use balanced fertilization (N:P:K = 8:15:15)",
            "Plant tolerant varieties like SC719"
        ],
        "color": "warning"
    },
    "Streak Virus": {
        "description": "Viral disease transmitted by leafhoppers causing pale streaks.",
        "recommendations": [
            "Control insect vectors with imidacloprid seed treatment",
            "Remove alternative host plants near fields",
            "Plant early to avoid peak leafhopper season",
            "Use resistant varieties like Pannar 4R-726 BR",
            "Rogue infected plants within 3 weeks of emergence"
        ],
        "color": "danger"
    },
    "Healthy": {
        "description": "No signs of major diseases detected.",
        "recommendations": [
            "Continue weekly field scouting",
            "Maintain soil pH between 5.5-7.0",
            "Apply balanced NPK fertilizer (200kg/ha)",
            "Ensure adequate spacing (30cm between plants)",
            "Monitor for pests like stalk borer weekly"
        ],
        "color": "success"
    },
    "Non Maize": {
        "description": "Uploaded image doesn't appear to be maize.",
        "recommendations": [
            "Capture clear images of maize leaves at eye level",
            "Ensure entire leaf is visible with good lighting",
            "Avoid blurred or distant shots",
            "Focus on middle canopy leaves",
            "Take photos during morning hours for best results"
        ],
        "color": "secondary"
    }
}

# Class names corresponding to model output
CLASS_NAMES = ['Blight', 'Common Rust', 'Gray Leaf Spot', 'Healthy','Non Maize','Streak Virus']

# Load model with custom layer
with tf.keras.utils.custom_object_scope({'AttentionLayer': AttentionLayer}):
    model = load_model('Maize_Disease_Model.keras')  # Pretained model

@app.route('/')
def welcome():
    return render_template('welcome.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if username in users and check_password_hash(users[username]['password'], password):
            session['logged_in'] = True
            session['username'] = username
            users[username]['last_login'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            return redirect(url_for('dashboard'))
        flash('Invalid username or password', 'danger')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('welcome'))

@app.route('/dashboard')
def dashboard():
    if 'logged_in' not in session:
        return redirect(url_for('login'))
    
    username = session['username']
    user_history = detection_history.get(username, [])
    
    # Calculate stats for all diseases
    stats = {
        'total_scans': len(user_history),
        'disease_detected': sum(1 for scan in user_history if scan['result'] != 'Healthy' and scan['result'] != 'Non Maize'),
        'healthy_plants': sum(1 for scan in user_history if scan['result'] == 'Healthy'),
        'non_maize': sum(1 for scan in user_history if scan['result'] == 'Non Maize')
    }
    
    # Add disease-specific counts
    for disease in CLASS_NAMES:
        if disease != 'Healthy' and disease != 'Non Maize':
            stats[disease.lower().replace(' ', '_')] = sum(
                1 for scan in user_history if scan['result'] == disease
            )
    
    return render_template('dashboard.html', 
                         user=users[username],
                         stats=stats,
                         history=user_history[-5:][::-1],
                         diseases=CLASS_NAMES,
                         disease_info=DISEASE_INFO)

@app.route('/upload', methods=['POST'])
def upload():
    if 'logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
        return jsonify({'error': 'Invalid file type'}), 400

    try:
        img = Image.open(file.stream).convert('RGB').resize((150, 150))
        img_array = np.array(img) / 255.0
        img_array = np.expand_dims(img_array, axis=0)
        
        prediction = model.predict(img_array)
        confidence = float(np.max(prediction))
        predicted_class_idx = np.argmax(prediction, axis=1)[0]
        disease_name = CLASS_NAMES[predicted_class_idx]
        
        # Get disease-specific recommendations
        disease_data = DISEASE_INFO.get(disease_name, {})
        recommendations = disease_data.get('recommendations', [])

        username = session['username']
        if username not in detection_history:
            detection_history[username] = []
        
        detection_record = {
            'date': datetime.now().strftime("%Y-%m-%d"),
            'timestamp': datetime.now().strftime("%H:%M:%S"),
            'result': disease_name,
            'confidence': confidence,
            'image': file.filename,
            'recommendations': recommendations  # Store for history
        }
        
        detection_history[username].append(detection_record)

        # Return all necessary data in one response
        return jsonify({
            'result': disease_name,
            'confidence': confidence,
            'description': disease_data.get('description', ''),
            'recommendations': recommendations,
            'timestamp': detection_record['timestamp']
        })
    
    except Exception as e:
        app.logger.error(f"Prediction error: {str(e)}")
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

@app.route('/about')
def about():
    return render_template('about.html', user=users["admin"], disease_info=DISEASE_INFO)

if __name__ == '__main__':
    app.run(debug=True)