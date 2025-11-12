FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY slide_helper_api.py .
COPY mcp_server.py .
COPY openapi_spec.json .

# Expose ports
EXPOSE 5002 8001

# Create entrypoint script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "Starting Slide Helper API on port 5002..."\n\
python3 slide_helper_api.py &\n\
SLIDE_HELPER_PID=$!\n\
\n\
echo "Waiting for Slide Helper API to be ready..."\n\
sleep 3\n\
\n\
echo "Starting MCP Server on port 8001..."\n\
python3 mcp_server.py --port 8001 --api-url http://presenton:80 --slide-helper-url http://localhost:5002 &\n\
MCP_PID=$!\n\
\n\
echo "All services started successfully!"\n\
echo "  - Slide Helper API: http://localhost:5002"\n\
echo "  - MCP Server: http://localhost:8001"\n\
\n\
# Wait for both processes\n\
wait $SLIDE_HELPER_PID $MCP_PID\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]
