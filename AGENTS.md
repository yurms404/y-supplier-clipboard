# Project instructions

- After each completed change to extension behavior or UI, increment the extension version in `manifest.json` and keep `package.json` version identical.
- Use a patch increment for fixes and cosmetic changes; use a minor increment for a new feature. Increment once per completed request, not once per edited file. Documentation-only changes do not require a version bump.
- Do not change `manifest_version` or the profiles' `schemaVersion` as part of a release version bump.
- Tell the user the new extension version in the final response and remind them to reload the extension and page.
