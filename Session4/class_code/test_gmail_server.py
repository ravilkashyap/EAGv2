#!/usr/bin/env python3
"""
Test script to verify Gmail MCP server is working
"""

import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def test_gmail_server():
    """Test Gmail server connection and basic functionality"""

    print("Testing Gmail MCP server...")

    try:
        server_params = StdioServerParameters(
            command="uv",
            args=[
                "run",
                "/Users/ravil/Documents/TSAI/Session4/class_code/gmail-mcp-server/src/gmail/server.py",
                "--creds-file-path", "/Users/ravil/Documents/TSAI/gmail_credentials.json",
                "--token-path", "/Users/ravil/Documents/TSAI/gmail_token.json"
            ]
        )

        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                print("Session created, initializing...")
                await session.initialize()

                # Get available tools
                print("Requesting tool list...")
                tools_result = await session.list_tools()
                tools = tools_result.tools
                print(f"Successfully retrieved {len(tools)} tools")

                # Print tool names
                for tool in tools:
                    print(f"  - {tool.name}: {tool.description}")

                return True

    except Exception as e:
        print(f"Error testing Gmail server: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(test_gmail_server())
