"""MCP (Model Context Protocol) layer for OpenEidon."""

from openeidon.mcp.client import MCPClient
from openeidon.mcp.protocol import MCPError, MCPNotification, MCPRequest, MCPResponse
from openeidon.mcp.server import MCPServer
from openeidon.mcp.transport import (
    InProcessTransport,
    MCPTransport,
    SSETransport,
    StdioTransport,
    StreamableHTTPTransport,
)

__all__ = [
    "MCPClient",
    "MCPError",
    "MCPNotification",
    "MCPRequest",
    "MCPResponse",
    "MCPServer",
    "MCPTransport",
    "InProcessTransport",
    "SSETransport",
    "StdioTransport",
    "StreamableHTTPTransport",
]
