from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from datetime import datetime
import time

app = Flask(__name__)

# CORS configuration - Allow all origins for development
CORS(app, origins='*', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'])

# In-memory storage for cloud variables by projectID
cloud_variables = {}  # Format: {projectID: {variable_name: {"value": "0", "timestamp": <ms>}, ...}}
start_time = time.time()  # Track server start time for uptime

@app.route('/')
def home():
    """Railway health check and info endpoint"""
    return jsonify({
        'message': 'Scratch Cloud Variables Server',
        'status': 'running',
        'cloudVariables': cloud_variables,
        'endpoints': {
            'get': '/api/cloud?projectID=<id>&name=<variable_name>',
            'post': '/api/cloud',
            'get_all': '/api/cloud/all?projectID=<id>',
            'health': '/health'
        }
    })

@app.route('/api/cloud', methods=['GET'])
def get_cloud_variable():
    """Get a specific cloud variable's value for a project"""
    projectID = request.args.get('projectID')
    name = request.args.get('name')
    if not projectID or not name or not name.startswith('Cloud'):
        return jsonify({
            'success': False,
            'error': 'projectID and variable name (starting with "Cloud") are required'
        }), 400
    
    # Initialize project and variable if not exists
    if projectID not in cloud_variables:
        cloud_variables[projectID] = {}
    if name not in cloud_variables[projectID]:
        cloud_variables[projectID][name] = {'value': '0', 'timestamp': int(datetime.now().timestamp() * 1000)}
    
    print(f"[GET] {projectID}/{name} requested: {cloud_variables[projectID][name]['value']}")
    return jsonify({
        'success': True,
        'projectID': projectID,
        'name': name,
        'value': cloud_variables[projectID][name]['value'],
        'timestamp': cloud_variables[projectID][name]['timestamp']
    })

@app.route('/api/cloud/all', methods=['GET'])
def get_all_cloud_variables():
    """Get all cloud variables for a project"""
    projectID = request.args.get('projectID')
    if not projectID:
        return jsonify({
            'success': False,
            'error': 'projectID is required'
        }), 400
    
    # Initialize project if not exists
    if projectID not in cloud_variables:
        cloud_variables[projectID] = {}
    
    print(f"[GET] All cloud variables for project {projectID} requested: {cloud_variables[projectID]}")
    return jsonify({
        'success': True,
        'projectID': projectID,
        'variables': cloud_variables[projectID]
    })

@app.route('/api/cloud', methods=['POST'])
def update_cloud_variable():
    """Update a cloud variable's value for a project"""
    try:
        data = request.get_json()
        if not data or 'projectID' not in data or 'name' not in data or 'value' not in data:
            return jsonify({
                'success': False,
                'error': 'projectID, name, and value are required'
            }), 400
        
        projectID = data['projectID']
        name = data['name']
        if not name.startswith('Cloud'):
            return jsonify({
                'success': False,
                'error': 'Variable name must start with "Cloud"'
            }), 400
        
        # Initialize project and variable if not exists
        if projectID not in cloud_variables:
            cloud_variables[projectID] = {}
        if name not in cloud_variables[projectID]:
            cloud_variables[projectID][name] = {'value': '0', 'timestamp': int(datetime.now().timestamp() * 1000)}
        
        # No timestamp validation - last write wins
        old_value = cloud_variables[projectID][name]['value']
        cloud_variables[projectID][name]['value'] = str(data['value'])  # Convert to string like Scratch variables
        cloud_variables[projectID][name]['timestamp'] = int(datetime.now().timestamp() * 1000)
        
        print(f"[POST] {projectID}/{name} updated: {old_value} -> {cloud_variables[projectID][name]['value']}")
        
        return jsonify({
            'success': True,
            'projectID': projectID,
            'name': name,
            'oldValue': old_value,
            'newValue': cloud_variables[projectID][name]['value'],
            'timestamp': cloud_variables[projectID][name]['timestamp']
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
        'activeProjects': len(cloud_variables),
        'projectIds': list(cloud_variables.keys()),
        'uptime': f'{uptime_seconds:.2f} seconds'
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"🚀 Cloud Variables Server starting on port {port}")
    print(f"📡 Cloud API: http://localhost:{port}/api/cloud")
    print(f"📡 All Cloud Variables: http://localhost:{port}/api/cloud/all?projectID=<id>")
    print(f"❤️ Health check: http://localhost:{port}/health")
    
    # For HTTPS (self-signed cert for development)
    # app.run(host='0.0.0.0', port=port, debug=False, ssl_context='adhoc')
    
    # Regular HTTP
    app.run(host='0.0.0.0', port=port, debug=False)
