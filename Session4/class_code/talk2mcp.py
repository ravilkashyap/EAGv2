import os
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client
import asyncio
from google import genai
from concurrent.futures import TimeoutError
from functools import partial
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception_type

# Load environment variables from .env file
load_dotenv()

# Access your API key and initialize Gemini client correctly
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

max_iterations = 10
last_response = None
last_screenshot_path = None
iteration = 0
iteration_response = []

@retry(
    wait=wait_exponential_jitter(initial=1, max=60),
    stop=stop_after_attempt(5),
    retry=retry_if_exception_type((Exception,)),
    retry_error_callback=lambda retry_state: print(f"LLM generation failed after {retry_state.attempt_number} attempts")
)
async def generate_with_timeout(client, prompt, timeout=10):
    """Generate content with a timeout and retry logic"""
    print("Starting LLM generation...")
    try:
        # Convert the synchronous generate_content call to run in a thread
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt
                )
            ),
            timeout=timeout
        )
        print("LLM generation completed")
        return response
    except TimeoutError:
        print("LLM generation timed out!")
        raise
    except Exception as e:
        print(f"Error in LLM generation: {e}")
        # Don't re-raise here as tenacity will handle retries
        raise

def reset_state():
    """Reset all global variables to their initial state"""
    global last_response, last_screenshot_path, iteration, iteration_response
    last_response = None
    last_screenshot_path = None
    iteration = 0
    iteration_response = []

async def main():
    reset_state()  # Reset at the start of main
    print("Starting main execution...")
    try:
        # Connect to both Excalidraw and Gmail MCP servers
        print("Establishing connections to MCP servers...")

        # Excalidraw server
        excalidraw_params = StdioServerParameters(
            command="python",
            args=["mac_mcp_server.py"]
        )

        # Gmail server
        gmail_params = StdioServerParameters(
            command="uv",
            args=[
                "run",
                "/Users/ravil/Documents/TSAI/EAGv2/Session4/class_code/gmail-mcp-server/src/gmail/server.py",
                "--creds-file-path", "/Users/ravil/Documents/TSAI/EAGv2/gmail_credentials.json",
                "--token-path", "/Users/ravil/Documents/TSAI/EAGv2/gmail_token.json"
            ]
        )

        # Connect to both servers
        async with stdio_client(excalidraw_params) as (excalidraw_read, excalidraw_write), \
                   stdio_client(gmail_params) as (gmail_read, gmail_write):

            # Create sessions for both servers
            async with ClientSession(excalidraw_read, excalidraw_write) as excalidraw_session, \
                       ClientSession(gmail_read, gmail_write) as gmail_session:

                print("Sessions created, initializing...")
                await excalidraw_session.initialize()
                await gmail_session.initialize()

                # Get available tools from both servers
                print("Requesting tool lists...")
                excalidraw_tools_result = await excalidraw_session.list_tools()
                gmail_tools_result = await gmail_session.list_tools()

                # Combine tools from both servers
                tools = excalidraw_tools_result.tools + gmail_tools_result.tools
                print(f"Successfully retrieved {len(tools)} tools from both servers")


                # Create system prompt with available tools
                print("Creating system prompt...")
                print(f"Number of tools: {len(tools)}")

                try:
                    # First, let's inspect what a tool object looks like
                    # if tools:
                    #     print(f"First tool properties: {dir(tools[0])}")
                    #     print(f"First tool example: {tools[0]}")

                    tools_description = []
                    for i, tool in enumerate(tools):
                        try:
                            # Get tool properties
                            params = tool.inputSchema
                            desc = getattr(tool, 'description', 'No description available')
                            name = getattr(tool, 'name', f'tool_{i}')

                            # Format the input schema in a more readable way
                            if 'properties' in params:
                                param_details = []
                                for param_name, param_info in params['properties'].items():
                                    param_type = param_info.get('type', 'unknown')
                                    param_details.append(f"{param_name}: {param_type}")
                                params_str = ', '.join(param_details)
                            else:
                                params_str = 'no parameters'

                            tool_desc = f"{i+1}. {name}({params_str}) - {desc}"
                            tools_description.append(tool_desc)
                            print(f"Added description for tool: {tool_desc}")
                        except Exception as e:
                            print(f"Error processing tool {i}: {e}")
                            tools_description.append(f"{i+1}. Error processing tool")

                    tools_description = "\n".join(tools_description)
                    print("Successfully created tools description")
                except Exception as e:
                    print(f"Error creating tools description: {e}")
                    tools_description = "Error loading tools"

                print("Created system prompt...")

                system_prompt = f"""You are a math assistant that can solve problems, visualize results with Excalidraw, and send emails. You have access to mathematical tools, Excalidraw for visualization, and Gmail for communication.

Available tools:
{tools_description}

You must respond with EXACTLY ONE line in one of these formats (no additional text):
1. For function calls:
   FUNCTION_CALL: function_name|param1|param2|...

2. For final answers:
   FINAL_ANSWER: [number]

3. For end of answers:
   END_OF_ANSWER: [number]

Important:
- When a function returns multiple values, you need to process all of them
- Only give FINAL_ANSWER when you have completed all necessary calculations
- Do not repeat function calls with the same parameters
- You can use Excalidraw functions (open_chrome_excalidraw, draw_rectangle, add_text_in_excalidraw, take_screenshot) to visualize results and capture screenshots
- You can use Gmail functions (send-email) to share results via email with attachments
- When using send-email, provide: recipient_email|subject|HTML_body|attachment_path (attachment_path is optional)
- After visualizing with Excalidraw, call take_screenshot to capture the visualization, then use the returned screenshot path as the attachment_path in send-email
- The take_screenshot function saves to /tmp/filename and returns the full path
    - Use ravilkashyap619@gmail.com as the recipient always
    - Subject - Summarized one-liner of the question/problem (Eg: Convert "INDIA" to ASCII and sum exponentials)
    - Body - Well-formatted detailed steps and explanation of the solution. Format should be renderable by gmail. Do not include subject in the body. Ensure the format is HTML so that it gets rendered correctly. In the email DO NOT MENTION about excalidraw.
    - Attachment_path - The path to the screenshot file - "/tmp/excalidraw_screenshot.png"
- After visualizing with Excalidraw, you can send the result via email

Examples:
- FUNCTION_CALL: add|5|3
- FINAL_ANSWER: [The answer is 42]
- FUNCTION_CALL: open_chrome_excalidraw
- FUNCTION_CALL: draw_rectangle|100|100|400|300
- FUNCTION_CALL: add_text_in_excalidraw|The answer is 42
- FUNCTION_CALL: take_screenshot|excalidraw_screenshot.png
- FUNCTION_CALL: send-email|ravilkashyap619@gmail.com|Math Problem Solved|<p><strong>Calculation:</strong> 15 + 27 = 42, then 42 × 3 = 126</p><p><strong>Final answer: 126</strong></p>|/tmp/excalidraw_screenshot.png
- END_OF_ANSWER: [The answer is 42]

DO NOT include any explanations or additional text.
Your entire response should be a single line starting with one of these - FUNCTION_CALL:, FINAL_ANSWER:, END_OF_ANSWER:"""

                query = """Find the ASCII values of characters in THESCHOOLOFAI and then calculate the sum of exponentials of those values. When you have the final answer, you can use the Excalidraw tools to create a visual representation and display the results there as a rectangle. Always use the Excalidraw tools to show the final result. Once we display the result, call take_screenshot to capture the visualization (it will save to /tmp/excalidraw_screenshot.png), then send the result via email using the Gmail tools with the screenshot attached. The email will be sent as HTML, so format the body with proper HTML tags for better rendering. Use a clear subject line and provide the calculation steps and final answer in the HTML-formatted email body. You can return END_OF_ANSWER: at the very end"""
                print("Starting iteration loop...")

                # Use global iteration variables
                global iteration, last_response

                while iteration < max_iterations:
                    print(f"\n--- Iteration {iteration + 1} ---")
                    if last_response is None:
                        current_query = query
                    else:
                        current_query = current_query + "\n\n" + " ".join(iteration_response)
                        current_query = current_query + "  What should I do next?"

                    # Get model's response with timeout
                    print("Preparing to generate LLM response...")
                    prompt = f"{system_prompt}\n\nQuery: {current_query}"
                    try:
                        response = await generate_with_timeout(client, prompt)
                        response_text = response.text.strip()
                        print(f"LLM Response: {response_text}")

                        # Find the FUNCTION_CALL line in the response
                        for line in response_text.split('\n'):
                            line = line.strip()
                            if line.startswith("FUNCTION_CALL:"):
                                response_text = line
                                break

                    except Exception as e:
                        print(f"Failed to get LLM response: {e}")
                        break


                    if response_text.startswith("FUNCTION_CALL:"):
                        _, function_info = response_text.split(":", 1)
                        parts = [p.strip() for p in function_info.split("|")]
                        func_name, params = parts[0], parts[1:]

                        print(f"\nDEBUG: Raw function info: {function_info}")
                        print(f"DEBUG: Split parts: {parts}")
                        print(f"DEBUG: Function name: {func_name}")
                        print(f"DEBUG: Raw parameters: {params}")

                        try:
                            # Find the matching tool to get its input schema
                            tool = next((t for t in tools if t.name == func_name), None)
                            if not tool:
                                print(f"DEBUG: Available tools: {[t.name for t in tools]}")
                                raise ValueError(f"Unknown tool: {func_name}")

                            print(f"DEBUG: Found tool: {tool.name}")
                            print(f"DEBUG: Tool schema: {tool.inputSchema}")

                            # Prepare arguments according to the tool's input schema
                            arguments = {}
                            schema_properties = tool.inputSchema.get('properties', {})
                            print(f"DEBUG: Schema properties: {schema_properties}")

                            for param_name, param_info in schema_properties.items():
                                if not params:  # Check if we have enough parameters
                                    raise ValueError(f"Not enough parameters provided for {func_name}")

                                value = params.pop(0)  # Get and remove the first parameter
                                param_type = param_info.get('type', 'string')

                                print(f"DEBUG: Converting parameter {param_name} with value {value} to type {param_type}")

                                # Convert the value to the correct type based on the schema
                                if param_type == 'integer':
                                    arguments[param_name] = int(value)
                                elif param_type == 'number':
                                    arguments[param_name] = float(value)
                                elif param_type == 'array':
                                    # Handle array input
                                    if isinstance(value, str):
                                        value = value.strip('[]').split(',')
                                    arguments[param_name] = [int(x.strip()) for x in value]
                                else:
                                    arguments[param_name] = str(value)

                            print(f"DEBUG: Final arguments: {arguments}")
                            print(f"DEBUG: Calling tool {func_name}")

                            # Determine which server to use based on tool name
                            if func_name in ['open_chrome_excalidraw', 'draw_rectangle', 'add_text_in_excalidraw', 'take_screenshot']:
                                result = await excalidraw_session.call_tool(func_name, arguments=arguments)
                            elif func_name in ['send-email']:
                                result = await gmail_session.call_tool(func_name, arguments=arguments)
                            else:
                                # Default to excalidraw session for math tools
                                result = await excalidraw_session.call_tool(func_name, arguments=arguments)
                            print(f"DEBUG: Raw result: {result}")

                            # Get the full result content
                            if hasattr(result, 'content'):
                                print(f"DEBUG: Result has content attribute")
                                # Handle multiple content items
                                if isinstance(result.content, list):
                                    iteration_result = [
                                        item.text if hasattr(item, 'text') else str(item)
                                        for item in result.content
                                    ]
                                else:
                                    iteration_result = str(result.content)
                            else:
                                print(f"DEBUG: Result has no content attribute")
                                iteration_result = str(result)

                            # Check for additional data like screenshot_path
                            screenshot_path = None
                            if hasattr(result, 'screenshot_path'):
                                screenshot_path = result.screenshot_path
                                print(f"DEBUG: Found screenshot path: {screenshot_path}")
                                # Store screenshot path for later use
                                global last_screenshot_path
                                last_screenshot_path = screenshot_path

                            print(f"DEBUG: Final iteration result: {iteration_result}")

                            # Format the response based on result type
                            if isinstance(iteration_result, list):
                                result_str = f"[{', '.join(iteration_result)}]"
                            else:
                                result_str = str(iteration_result)

                            iteration_response.append(
                                f"In the {iteration + 1} iteration you called {func_name} with {arguments} parameters, "
                                f"and the function returned {result_str}."
                            )
                            last_response = iteration_result

                        except Exception as e:
                            print(f"DEBUG: Error details: {str(e)}")
                            print(f"DEBUG: Error type: {type(e)}")
                            import traceback
                            traceback.print_exc()
                            iteration_response.append(f"Error in iteration {iteration + 1}: {str(e)}")
                            break

                    elif response_text.startswith("FINAL_ANSWER:"):
                        print("\n=== Answer Obtained, time to display the result ===")
                        break

                    elif response_text.startswith("END_OF_ANSWER:"):
                        print("\n=== Agent Execution Complete ===")
                        break

                    iteration += 1

    except Exception as e:
        print(f"Error in main execution: {e}")
        import traceback
        traceback.print_exc()
    finally:
        reset_state()  # Reset at the end of main

if __name__ == "__main__":
    asyncio.run(main())
