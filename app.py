from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import time
import threading
from datetime import datetime

app = Flask(__name__)

# CORS configuration - Allow all origins for development
CORS(app, origins='*', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'])

# In-memory storage for cloud variables by projectID
cloud_variables = {}  # Format: {projectID: {variable_name: {"value": "0", "lastModified": timestamp}, ...}}
variable_locks = {}  # Per-variable locks to prevent race conditions
start_time = time.time()

def get_variable_lock(projectID, name):
    """Get or create a lock for a specific variable"""
    key = f"{projectID}/{name}"
    if key not in variable_locks:
        variable_locks[key] = threading.Lock()
    return variable_locks[key]

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
        cloud_variables[projectID][name] = {
            'value': '0',
            'lastModified': datetime.now().isoformat()
        }
    
    value_data = cloud_variables[projectID][name]
    print(f"[GET] {projectID}/{name} requested: {value_data['value']}")
    return jsonify({
        'success': True,
        'projectID': projectID,
        'name': name,
        'value': value_data['value'],
        'lastModified': value_data['lastModified']
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
    
    # Return simplified format for compatibility
    simplified_vars = {
        name: {'value': data['value']} 
        for name, data in cloud_variables[projectID].items()
    }
    
    print(f"[GET] All cloud variables for project {projectID} requested: {simplified_vars}")
    return jsonify({
        'success': True,
        'projectID': projectID,
        'variables': simplified_vars
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
        
        projectID = str(data['projectID'])
        name = str(data['name'])
        new_value = str(data['value'])  # Ensure string like Scratch
        
        if not name.startswith('Cloud'):
            return jsonify({
                'success': False,
                'error': 'Variable name must start with "Cloud"'
            }), 400
        
        # Validate value length (Scratch cloud vars have limits)
        if len(new_value) > 100000:  # 100KB limit like Scratch
            return jsonify({
                'success': False,
                'error': 'Value too long (max 100,000 characters)',
                'serverValue': cloud_variables.get(projectID, {}).get(name, {}).get('value', '0')
            }), 400
        
        # Use per-variable locking to prevent race conditions
        with get_variable_lock(projectID, name):
            # Initialize project and variable if not exists
            if projectID not in cloud_variables:
                cloud_variables[projectID] = {}
            if name not in cloud_variables[projectID]:
                cloud_variables[projectID][name] = {
                    'value': '0',
                    'lastModified': datetime.now().isoformat()
                }
            
            old_value = cloud_variables[projectID][name]['value']
            timestamp = datetime.now().isoformat()
            
            # Update the value
            cloud_variables[projectID][name] = {
                'value': new_value,
                'lastModified': timestamp
            }
            
            print(f"[POST] {projectID}/{name} updated: {old_value} -> {new_value}")
            
            return jsonify({
                'success': True,
                'projectID': projectID,
                'name': name,
                'oldValue': old_value,
                'newValue': new_value,
                'lastModified': timestamp
            })
            
    except Exception as e:
        print(f"[ERROR] Update failed: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/health')
def health_check():
    """Health check endpoint"""
    uptime_seconds = time.time() - start_time
    total_variables = sum(len(vars_dict) for vars_dict in cloud_variables.values())
    
    return jsonify({
        'status': 'ok',
        'activeProjects': len(cloud_variables),
        'totalVariables': total_variables,
        'projectIds': list(cloud_variables.keys()),
        'uptime': f'{uptime_seconds:.2f} seconds',
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"🚀 Cloud Variables Server starting on port {port}")
    print(f"📡 Cloud API: http://localhost:{port}/api/cloud")
    print(f"📡 All Cloud Variables: http://localhost:{port}/api/cloud/all?projectID=<id>")
    print(f"❤️ Health check: http://localhost:{port}/health")
    
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
