# YouTubePatch2014
If you patch the application version 5.0.2.1,
This is an attempt to emulate gdata 2.1.
# How does this work?
The server receives a request from the client, the server then converts it into a new format (understood by YouTube itself) and sends it to YouTube Data API V3, and the server receives a response from YouTube Data API V3 and converts this response into the old format and sends it to the client.
