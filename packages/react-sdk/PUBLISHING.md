# NPM Publishing Guide for @beacio/react

## Prerequisites

1. **NPM Account**: Create an account at https://www.npmjs.com/
2. **Organization**: Create or join the `@beacio` organization on NPM
3. **Authentication**: Login to NPM CLI
   ```bash
   npm login
   ```

## Pre-Publishing Checklist

✅ **Test Coverage**: 90.82% (exceeds 80% target)
✅ **All Tests Passing**: 329/329 tests passing (100% pass rate)
✅ **TypeScript Build**: Successfully builds with no errors
✅ **Package Size**: 104.9 kB (unpacked: 467.2 kB)
✅ **Files Included**: 
   - dist/ folder with ESM, CJS, UMD builds
   - TypeScript declarations
   - LICENSE, README, CHANGELOG

## Publishing Steps

### 1. Beta Release (Current)

```bash
# Verify package contents
npm pack --dry-run

# Publish beta version
npm publish --tag beta --access public
```

### 2. Testing Beta Installation

After publishing, test the installation:

```bash
# Create test project
npx create-react-app test-beacio
cd test-beacio

# Install beta package
npm install @beacio/react@beta

# Test import
```

```typescript
// In App.js
import { beacio } from '@beacio/react';

function App() {
  return (
    <beacio.Provider>
      {/* Your app */}
    </beacio.Provider>
  );
}
```

### 3. Production Release (After Beta Testing)

```bash
# Update version in package.json to 1.0.0
npm version major

# Publish production version
npm publish --access public
```

## Version Management

| Version | Status | Notes |
|---------|--------|-------|
| 1.0.0-beta.1 | Current | Ready for beta testing |
| 1.0.0 | Planned | After successful beta testing |

## Post-Publishing

1. **Verify on NPM**: https://www.npmjs.com/package/@beacio/react
2. **Update Documentation**: Add installation instructions to main README
3. **Create GitHub Release**: Tag the release in git
4. **Announce**: Share on social media, Discord, etc.

## Troubleshooting

If you encounter issues:

1. **Authentication Error**: Run `npm whoami` to verify login
2. **Permission Error**: Ensure you're a member of @beacio organization
3. **Build Error**: Run `npm run build` before publishing
4. **Test Failures**: Ensure all tests pass with `npm test`

## Current Package Stats

- **Statement Coverage**: 90.82%
- **Branch Coverage**: 89.94%
- **Function Coverage**: 94.9%
- **Line Coverage**: 91.72%
- **Tests**: 329 passing (100% pass rate)
- **Bundle Size**: <50KB gzipped ✅

## Support

For issues or questions, contact the development team or open an issue at:
https://github.com/wklm/beacio-sdk/issues