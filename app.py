from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from datetime import datetime
import time

app = Flask(__name__)

# CORS configuration - Allow all origins for development
CORS(app, origins='*', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'])

# In-memory storage for the CloudTest variable
cloud_test_value = "0"  # Default value
cloud_test_timestamp = int(datetime.now().timestamp() * 1000)  # Track last update
start_time = time.time()  # Track server start time for uptime

@app.route('/')
def home():
    """Railway health check and info endpoint"""
    return jsonify({
        'message': 'Scratch Cloud Variables Server',
        'status': 'running',
        'cloudTestValue': cloud_test_value,
        'endpoints': {
            'get': '/api/cloudtest',
            'post': '/api/cloudtest',
            'health': '/health'
        }
    })

@app.route('/api/cloudtest', methods=['GET'])
def get_cloudtest():
    """Get current CloudTest value"""
    print(f"[GET] CloudTest requested: {cloud_test_value}")
    return jsonify({
        'success': True,
        'value': cloud_test_value,
        'timestamp': cloud_test_timestamp
    })

@app.route('/api/cloudtest', methods=['POST'])
def update_cloudtest():
    """Update CloudTest value"""
    global cloud_test_value, cloud_test_timestamp
    
    try:
        data = request.get_json()
        if not data or 'value' not in data:
            return jsonify({
                'success': False,
                'error': 'Value is required'
            }), 400
        
        # Optional: Check timestamp to avoid overwriting newer updates
        client_timestamp = data.get('timestamp', 0)
        if client_timestamp < cloud_test_timestamp:
            return jsonify({
                'success': False,
                'error': 'Update rejected: Server has newer value',
                'serverValue': cloud_test_value,
                'serverTimestamp': cloud_test_timestamp
            }), 409
        
        old_value = cloud_test_value
        cloud_test_value = str(data['value'])  # Convert to string like Scratch variables
        cloud_test_timestamp = int(datetime.now().timestamp() * 1000)
        
        print(f"[POST] CloudTest updated: {old_value} -> {cloud_test_value}")
        
        return jsonify({
            'success': True,
            'oldValue': old_value,
            'newValue': cloud_test_value,
            'timestamp': cloud_test_timestamp
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Invalid JSON: {str(e)}'
        }), 400

@app.route('/health')
def health_check():
    """Health check endpoint"""
    uptime_seconds = time.time() - start_time
    return jsonify({
        'status': 'ok',
        'activeProjects': 0,  # No project_data, assume single project
        'projectIds': [],     # Placeholder for project IDs
        'uptime': f'{uptime_seconds:.2f} seconds'
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"🚀 Cloud Variables Server starting on port {port}")
    print(f"📡 CloudTest API: http://localhost:{port}/api/cloudtest")
    print(f"❤️ Health check: http://localhost:{port}/health")
    
    # For HTTPS (self-signed cert for development)
    # app.run(host='0.0.0.0', port=port, debug=False, ssl_context='adhoc')
    
    # Regular HTTP
    app.run(host='0.0.0.0', port=port, debug=False)