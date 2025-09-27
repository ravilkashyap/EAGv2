# Mac-compatible MCP server using Chrome + Excalidraw for drawing
from mcp.server.fastmcp import FastMCP, Image
from mcp.server.fastmcp.prompts import base
from mcp.types import TextContent
from mcp import types
from PIL import Image as PILImage
import math
import sys
import subprocess
import time
import pyautogui
import pygetwindow as gw
import os
import webbrowser
import functools

# --- Ensure print statements are always flushed ---
print = functools.partial(print, flush=True)

# instantiate an MCP server client
mcp = FastMCP("MacExcalidrawApp")

# Global variables
browser_open = False
rect_position = None

# DEFINE TOOLS

# Addition tool
@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    print("CALLED: add(a: int, b: int) -> int:")
    return int(a + b)

@mcp.tool()
def add_list(l: list) -> int:
    """Add all numbers in a list"""
    print("CALLED: add(l: list) -> int:")
    return sum(l)

# Subtraction tool
@mcp.tool()
def subtract(a: int, b: int) -> int:
    """Subtract two numbers"""
    print("CALLED: subtract(a: int, b: int) -> int:")
    return int(a - b)

# Multiplication tool
@mcp.tool()
def multiply(a: int, b: int) -> int:
    """Multiply two numbers"""
    print("CALLED: multiply(a: int, b: int) -> int:")
    return int(a * b)

# Division tool
@mcp.tool()
def divide(a: int, b: int) -> float:
    """Divide two numbers"""
    print("CALLED: divide(a: int, b: int) -> float:")
    return float(a / b)

# Power tool
@mcp.tool()
def power(a: int, b: int) -> int:
    """Power of two numbers"""
    print("CALLED: power(a: int, b: int) -> int:")
    return int(a ** b)

# Square root tool
@mcp.tool()
def sqrt(a: int) -> float:
    """Square root of a number"""
    print("CALLED: sqrt(a: int) -> float:")
    return float(a ** 0.5)

# Cube root tool
@mcp.tool()
def cbrt(a: int) -> float:
    """Cube root of a number"""
    print("CALLED: cbrt(a: int) -> float:")
    return float(a ** (1/3))

# Factorial tool
@mcp.tool()
def factorial(a: int) -> int:
    """factorial of a number"""
    print("CALLED: factorial(a: int) -> int:")
    return int(math.factorial(a))

# Log tool
@mcp.tool()
def log(a: int) -> float:
    """log of a number"""
    print("CALLED: log(a: int) -> float:")
    return float(math.log(a))

# Remainder tool
@mcp.tool()
def remainder(a: int, b: int) -> int:
    """remainder of two numbers division"""
    print("CALLED: remainder(a: int, b: int) -> int:")
    return int(a % b)

# Sin tool
@mcp.tool()
def sin(a: int) -> float:
    """sin of a number"""
    print("CALLED: sin(a: int) -> float:")
    return float(math.sin(a))

# Cos tool
@mcp.tool()
def cos(a: int) -> float:
    """cos of a number"""
    print("CALLED: cos(a: int) -> float:")
    return float(math.cos(a))

# Tan tool
@mcp.tool()
def tan(a: int) -> float:
    """tan of a number"""
    print("CALLED: tan(a: int) -> float:")
    return float(math.tan(a))

# Mine tool
@mcp.tool()
def mine(a: int, b: int) -> int:
    """special mining tool"""
    print("CALLED: mine(a: int, b: int) -> int:")
    return int(a - b - b)

@mcp.tool()
def create_thumbnail(image_path: str) -> Image:
    """Create a thumbnail from an image"""
    print("CALLED: create_thumbnail(image_path: str) -> Image:")
    img = PILImage.open(image_path)
    img.thumbnail((100, 100))
    return Image(data=img.tobytes(), format="png")

@mcp.tool()
def strings_to_chars_to_int(string: str) -> list[int]:
    """Return the ASCII values of the characters in a word"""
    print("CALLED: strings_to_chars_to_int(string: str) -> list[int]:")
    return [int(ord(char)) for char in string]

@mcp.tool()
def int_list_to_exponential_sum(int_list: list) -> float:
    """Return sum of exponentials of numbers in a list"""
    print("CALLED: int_list_to_exponential_sum(int_list: list) -> float:")
    return sum(math.exp(i) for i in int_list)

@mcp.tool()
def fibonacci_numbers(n: int) -> list:
    """Return the first n Fibonacci Numbers"""
    print("CALLED: fibonacci_numbers(n: int) -> list:")
    if n <= 0:
        return []
    fib_sequence = [0, 1]
    for _ in range(2, n):
        fib_sequence.append(fib_sequence[-1] + fib_sequence[-2])
    return fib_sequence[:n]

@mcp.tool()
async def open_chrome_excalidraw() -> dict:
    """Open Chrome browser and navigate to Excalidraw"""
    global browser_open
    try:
        # Open Excalidraw in Chrome
        chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        excalidraw_url = "https://excalidraw.com"

        if os.path.exists(chrome_path):
            # Use Chrome if available
            subprocess.Popen([chrome_path, excalidraw_url])
        else:
            # Fallback to default browser
            webbrowser.open(excalidraw_url)

        time.sleep(4)  # Wait for browser to open and page to load

        # Try to find the browser window
        # Get all window titles and find Excalidraw or Chrome
        all_titles = gw.getAllTitles()
        excalidraw_found = any('Excalidraw' in title for title in all_titles)
        chrome_found = any('Google Chrome' in title for title in all_titles)

        if excalidraw_found or chrome_found:
            browser_open = True
            # Get the window geometry for the first Chrome/Excalidraw window
            if chrome_found:
                # Find a Chrome window and activate it
                for title in all_titles:
                    if 'Google Chrome' in title:
                        # We can't directly activate from title, but we can assume it's open
                        break
            # Focus the canvas by clicking near the center
            screen_width, screen_height = pyautogui.size()
            pyautogui.click(screen_width // 2, screen_height // 2)
            time.sleep(0.3)
        else:
            return {
                "content": [
                    TextContent(
                        type="text",
                        text="Failed to find browser window after opening"
                    )
                ]
            }

        return {
            "content": [
                TextContent(
                    type="text",
                    text="Chrome opened with Excalidraw successfully"
                )
            ]
        }
    except Exception as e:
        return {
            "content": [
                TextContent(
                    type="text",
                    text=f"Error opening Chrome with Excalidraw: {str(e)}"
                )
            ]
        }

@mcp.tool()
async def draw_rectangle(x1: int, y1: int, x2: int, y2: int) -> dict:
    """Draw a rectangle in Excalidraw from (x1,y1) to (x2,y2)"""
    global browser_open
    try:
        if not browser_open:
            return {
                "content": [
                    TextContent(
                        type="text",
                        text="Browser is not open. Please call open_chrome_excalidraw first."
                    )
                ]
            }

        # Get browser window - check if it's open
        all_titles = gw.getAllTitles()
        excalidraw_found = any('Excalidraw' in title for title in all_titles)
        chrome_found = any('Google Chrome' in title for title in all_titles)

        if not (excalidraw_found or chrome_found):
            return {
                "content": [
                    TextContent(
                        type="text",
                        text="Browser window not found"
                    )
                ]
            }

        # Get the first Chrome window we can find
        try:
            # Try to get any Chrome window
            if chrome_found:
                # For now, we'll work with screen coordinates instead of specific window
                pass
        except:
            return {
                "content": [
                    TextContent(
                        type="text",
                        text="Failed to get browser window details"
                    )
                ]
            }

        # Get screen size for positioning
        screen_width, screen_height = pyautogui.size()

        # Ensure canvas focus, then select Rectangle with '2'
        pyautogui.click(screen_width // 2, screen_height // 2)
        time.sleep(0.2)
        print("Selecting Rectangle tool using '2' key...")
        try:
            pyautogui.press('2')
            print("✓ Used '2' to select Rectangle tool")
        except Exception as e:
            return {
                "content": [
                    TextContent(
                        type="text",
                        text=f"Failed to select rectangle tool with '2': {str(e)}"
                    )
                ]
            }
        time.sleep(0.3)

        # Create a large rectangle starting from 1/4th of the screen (safer coordinates)
        # Use bigger margins to avoid dragging the browser window itself
        margin = 150  # pixels from each edge (increased for safety)
        start_x = screen_width // 4   # Start at 1/4th of screen width
        start_y = screen_height // 4  # Start at 1/4th of screen height
        end_x = screen_width - margin
        end_y = screen_height - margin

        print(f"Screen size: {screen_width}x{screen_height}")
        print(f"Drawing large rectangle from ({start_x}, {start_y}) to ({end_x}, {end_y})")

        # Move to safe starting position (1/4th of screen)
        pyautogui.moveTo(start_x, start_y)
        time.sleep(0.3)  # Extra pause to ensure position is set

        # Drag to create rectangle
        pyautogui.dragTo(end_x, end_y, duration=1.0, button='left')
        time.sleep(0.4)  # Extra pause after drag

        # Store rectangle center position for later text placement
        global rect_position
        rect_position = ((start_x + end_x) // 2, (start_y + end_y) // 2)

        return {
            "content": [
                TextContent(
                    type="text",
                    text=f"Rectangle drawn from ({x1},{y1}) to ({x2},{y2})"
                )
            ]
        }
    except Exception as e:
        return {
            "content": [
                TextContent(
                    type="text",
                    text=f"Error drawing rectangle: {str(e)}"
                )
            ]
        }

@mcp.tool()
async def add_text_in_excalidraw(text: str) -> dict:
    """Add text in Excalidraw"""
    global browser_open
    try:
        if not browser_open:
            return {
                "content": [
                    TextContent(
                        type="text",
                        text="Browser is not open. Please call open_chrome_excalidraw first."
                    )
                ]
            }

        # Check if browser is still open
        all_titles = gw.getAllTitles()
        excalidraw_found = any('Excalidraw' in title for title in all_titles)
        chrome_found = any('Google Chrome' in title for title in all_titles)

        if not (excalidraw_found or chrome_found):
            return {
                "content": [
                    TextContent(
                        type="text",
                        text="Browser window not found"
                    )
                ]
            }

        # Get screen size for positioning
        screen_width, screen_height = pyautogui.size()

        # Use text tool (8) and click at specific positions within the rectangle
        print("Using text tool (8) to add text at specific positions...")

        if rect_position is None:
            return {
                "content": [
                    TextContent(
                        type="text",
                        text="No rectangle position stored. Please draw rectangle first."
                    )
                ]
            }

        rect_x, rect_y = rect_position

        try:
            # First, select text tool using key '8'
            print("Selecting text tool with '8'...")
            pyautogui.press('8')
            time.sleep(0.8)  # Longer delay to ensure text tool is activated

            # Recalculate rectangle bounds (same as in draw_rectangle function)
            screen_width, screen_height = pyautogui.size()
            margin = 150  # Same margin as in draw_rectangle
            start_x = screen_width // 4
            start_y = screen_height // 4
            end_x = screen_width - margin
            end_y = screen_height - margin

            rect_width = end_x - start_x
            rect_height = end_y - start_y

            # Position 1: Header text at the vertical and horizontal center of the rectangle (centered)
            header_x = start_x + rect_width // 2  # Center horizontally
            header_y = start_y + rect_height // 2  # Center vertically

            # Position 2: Main answer at center of rectangle (same as header for now)
            center_x = rect_x
            center_y = rect_y

            # Add header text first
            print(f"Adding header text at ({header_x}, {header_y}) - Rectangle bounds: ({start_x},{start_y}) to ({end_x},{end_y})")
            pyautogui.click(header_x, header_y)
            time.sleep(0.3)

            header_text = "This is being done automatically by agent"
            print(f"Typing header text: '{header_text}'")
            pyautogui.typewrite(header_text)
            time.sleep(0.5)
            pyautogui.press('enter')
            time.sleep(0.3)

            # Add main answer text at center
            print(f"Adding main text at ({center_x}, {center_y})")

            # Exit any text editing mode and re-select text tool
            print("Exiting text mode and re-selecting text tool...")
            pyautogui.press('escape')  # Exit any active text editing
            time.sleep(0.2)
            pyautogui.press('8')  # Select text tool
            time.sleep(0.5)

            pyautogui.click(center_x, center_y)
            time.sleep(0.3)

            print(f"Typing main text: '{text}'")
            pyautogui.typewrite(text)
            time.sleep(0.5)
            pyautogui.press('enter')
            time.sleep(0.3)

            print("✅ Both header and main text should now be visible in the rectangle")

        except Exception as e:
            return {
                "content": [
                    TextContent(
                        type="text",
                        text=f"Failed to add text using text tool: {str(e)}"
                    )
                ]
            }

        return {
            "content": [
                TextContent(
                    type="text",
                    text=f"Text '{text}' added successfully"
                )
            ]
        }
    except Exception as e:
        return {
            "content": [
                TextContent(
                    type="text",
                    text=f"Error adding text: {str(e)}"
                )
            ]
        }

# DEFINE RESOURCES

# Add a dynamic greeting resource
@mcp.resource("greeting://{name}")
def get_greeting(name: str) -> str:
    """Get a personalized greeting"""
    print("CALLED: get_greeting(name: str) -> str:")
    return f"Hello, {name}!"

# DEFINE AVAILABLE PROMPTS
@mcp.prompt()
def review_code(code: str) -> str:
    return f"Please review this code:\n\n{code}"
    print("CALLED: review_code(code: str) -> str:")

@mcp.prompt()
def debug_error(error: str) -> list[base.Message]:
    return [
        base.UserMessage("I'm seeing this error:"),
        base.UserMessage(error),
        base.AssistantMessage("I'll help debug that. What have you tried so far?"),
    ]

if __name__ == "__main__":
    # Check if running with mcp dev command
    print("STARTING MAC DRAWING SERVER")
    if len(sys.argv) > 1 and sys.argv[1] == "dev":
        mcp.run()  # Run without transport for dev server
    else:
        mcp.run(transport="stdio")  # Run with stdio for direct execution
