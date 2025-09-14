from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from datetime import datetime
import time

app = Flask(__name__)

# CORS configuration - Allow all origins for development
CORS(app, origins='*', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'])

# In-memory storage for cloud variables
cloud_variables = {}  # Format: {"CloudTest": {"value": "0", "timestamp": <ms>}, ...}
start_time = time.time()  # Track server start time for uptime

@app.route('/')
def home():
    """Railway health check and info endpoint"""
    return jsonify({
        'message': 'Scratch Cloud Variables Server',
        'status': 'running',
        'cloudVariables': cloud_variables,
        'endpoints': {
            'get': '/api/cloud?name=<variable_name>',
            'post': '/api/cloud',
            'get_all': '/api/cloud/all',
            'health': '/health'
        }
    })

@app.route('/api/cloud', methods=['GET'])
def get_cloud_variable():
    """Get a specific cloud variable's value"""
    name = request.args.get('name')
    if not name or not name.startswith('Cloud'):
        return jsonify({
            'success': False,
            'error': 'Variable name must start with "Cloud"'
        }), 400
    
    # Initialize variable if not exists
    if name not in cloud_variables:
        cloud_variables[name] = {'value': '0', 'timestamp': int(datetime.now().timestamp() * 1000)}
    
    print(f"[GET] {name} requested: {cloud_variables[name]['value']}")
    return jsonify({
        'success': True,
        'name': name,
        'value': cloud_variables[name]['value'],
        'timestamp': cloud_variables[name]['timestamp']
    })

@app.route('/api/cloud/all', methods=['GET'])
def get_all_cloud_variables():
    """Get all cloud variables"""
    print(f"[GET] All cloud variables requested: {cloud_variables}")
    return jsonify({
        'success': True,
        'variables': cloud_variables
    })

@app.route('/api/cloud', methods=['POST'])
def update_cloud_variable():
    """Update a cloud variable's value"""
    try:
        data = request.get_json()
        if not data or 'name' not in data or 'value' not in data:
            return jsonify({
                'success': False,
                'error': 'Name and value are required'
            }), 400
        
        name = data['name']
        if not name.startswith('Cloud'):
            return jsonify({
                'success': False,
                'error': 'Variable name must start with "Cloud"'
            }), 400
        
        # Initialize if not exists
        if name not in cloud_variables:
            cloud_variables[name] = {'value': '0', 'timestamp': int(datetime.now().timestamp() * 1000)}
        
        # Check timestamp to avoid overwriting newer updates
        client_timestamp = data.get('timestamp', 0)
        if client_timestamp < cloud_variables[name]['timestamp']:
            return jsonify({
                'success': False,
                'error': 'Update rejected: Server has newer value',
                'serverValue': cloud_variables[name]['value'],
                'serverTimestamp': cloud_variables[name]['timestamp']
            }), 409
        
        old_value = cloud_variables[name]['value']
        cloud_variables[name]['value'] = str(data['value'])  # Convert to string like Scratch variables
        cloud_variables[name]['timestamp'] = int(datetime.now().timestamp() * 1000)
        
        print(f"[POST] {name} updated: {old_value} -> {cloud_variables[name]['value']}")
        
        return jsonify({
            'success': True,
            'name': name,
            'oldValue': old_value,
            'newValue': cloud_variables[name]['value'],
            'timestamp': cloud_variables[name]['timestamp']
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
    print(f"📡 Cloud API: http://localhost:{port}/api/cloud")
    print(f"📡 All Cloud Variables: http://localhost:{port}/api/cloud/all")
    print(f"❤️ Health check: http://localhost:{port}/health")
    
    # For HTTPS (self-signed cert for development)
    # app.run(host='0.0.0.0', port=port, debug=False, ssl_context='adhoc')
    
    # Regular HTTP
    app.run(host='0.0.0.0', port=port, debug=False)
