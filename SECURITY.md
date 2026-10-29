# Reporting a security problem

Email support@morphscreen.com with "Security" in the subject. Please don't
post it anywhere public first.

Tell us what you found, how to reproduce it (the request, the answer text,
the page or app it showed in) and what someone could do with it. A short
proof of concept helps more than a scanner report.

We reply within 3 business days (Monday to Friday, India time) to say we've
got it, then keep you posted until it's fixed. Tell us if you'd like to be
credited when the fix ships.

## What's covered

- The API (api.morphscreen.com)
- The core, the web SDK, the SwiftUI and Compose SDKs, and the tools in this
  repository

What counts most: anything that runs a model's text as code, loads from a
host the app didn't allow, leaks a key, or reads someone else's account,
answers or usage.

Please don't load-test our servers, read or change other people's data, or
try phishing or social engineering. Bugs in OpenRouter, a photo provider (Pexels,
Unsplash, Openverse) or a map provider go to them.

## Versions

During the beta only the latest release of each SDK gets fixes.

docs/security.md says what the SDKs run and load and what the API keeps.
