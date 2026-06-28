import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as InstallationWizardModule from '../../src/components/InstallationWizard';
import { ExtensionDetector } from '../../src/core/ExtensionDetector';

const { InstallationWizard } = InstallationWizardModule;

// Mock ExtensionDetector
jest.mock('../../src/core/ExtensionDetector');

const MockExtensionDetector = ExtensionDetector as jest.MockedClass<typeof ExtensionDetector>;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('InstallationWizard', () => {
  let mockDetector: any;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    
    // Create mock instance methods
    mockDetector = {
      detect: jest.fn(),
      detectInstallState: jest.fn(),
      getInstallState: jest.fn().mockReturnValue('not-installed'),
    };
    
    // Mock constructor to return our mock instance
    MockExtensionDetector.mockImplementation(() => mockDetector);
  });

  describe('Checking state', () => {
    it('should render null while checking', async () => {
      mockDetector.detectInstallState.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      const { container } = render(<InstallationWizard />);
      
      // Component returns null during checking
      expect(container.innerHTML).toBe('');
    });
  });

  describe('Extension installed state', () => {
    it('should render null when extension is detected', async () => {
      mockDetector.detectInstallState.mockResolvedValue('active');
      
      const { container } = render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(container.innerHTML).toBe('');
      });
    });

    it('should call onComplete callback when extension is installed', async () => {
      mockDetector.detectInstallState.mockResolvedValue('active');
      const onComplete = jest.fn();
      
      render(<InstallationWizard onComplete={onComplete} />);
      
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });
    });

    it('should not show any UI when installed', async () => {
      mockDetector.detectInstallState.mockResolvedValue('active');
      
      const { container } = render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(container.innerHTML).toBe('');
      });
      
      expect(screen.queryByText('Bluetooth Required')).not.toBeInTheDocument();
      expect(screen.queryByText('Start Setup')).not.toBeInTheDocument();
    });
  });

  describe('Extension not installed state', () => {
    beforeEach(() => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');
    });

    it('should show Bluetooth Required title', async () => {
      render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });
    });

    it('should show the install button', async () => {
      render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Start Setup')).toBeInTheDocument();
      });
    });

    it('should show the dismiss button', async () => {
      render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Not now')).toBeInTheDocument();
      });
    });

    it('should show FAQ sections', async () => {
      render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('How does this work?')).toBeInTheDocument();
        expect(screen.getByText('Privacy: No data collected')).toBeInTheDocument();
      });
    });

    it('should show meta info (rating, price)', async () => {
      render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Free')).toBeInTheDocument();
        expect(screen.getByText('4.8')).toBeInTheDocument();
        expect(screen.getByText('★★★★★')).toBeInTheDocument();
      });
    });

    it('should navigate to the canonical setup page when install button is clicked', async () => {
      const navigateSpy = jest
        .spyOn(InstallationWizardModule.navigationController, 'navigateToUrl')
        .mockImplementation(() => {});

      render(<InstallationWizard />);

      await waitFor(() => {
        const button = screen.getByText('Start Setup');
        fireEvent.click(button);
      });

      expect(navigateSpy).toHaveBeenCalledWith('https://beacio.com/setup');
    });

    it('should use custom appStoreUrl when provided', async () => {
      const navigateSpy = jest
        .spyOn(InstallationWizardModule.navigationController, 'navigateToUrl')
        .mockImplementation(() => {});

      const customUrl = 'https://apps.apple.com/app/custom/id1234567890';
      render(<InstallationWizard appStoreUrl={customUrl} />);
      
      await waitFor(() => {
        const button = screen.getByText('Start Setup');
        fireEvent.click(button);
      });

      expect(navigateSpy).toHaveBeenCalledWith(customUrl);
    });

    it('should not call onComplete when extension is not installed', async () => {
      const onComplete = jest.fn();
      
      render(<InstallationWizard onComplete={onComplete} />);
      
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });
      
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('should dismiss when Not now is clicked', async () => {
      const { container } = render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Not now')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Not now'));
      
      // Component should render null after dismiss
      expect(container.innerHTML).toBe('');
    });

    it('should save dismiss timestamp to localStorage', async () => {
      render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Not now')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Not now'));
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'beacio_dismiss_until',
        expect.any(String)
      );
    });
  });

  describe('Props handling', () => {
    it('should apply custom className', async () => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');
      const className = 'custom-wizard';
      
      const { container } = render(<InstallationWizard className={className} />);
      
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      expect(container.querySelector(`.${className}`)).toBeInTheDocument();
    });

    it('should use operatorName in description text', async () => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');

      const { container } = render(<InstallationWizard operatorName="MyApp" />);

      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      // operatorName now appears in the body AND the SB-PRD-03 return affordance;
      // scope to the description body to keep this assertion's original intent.
      const body = container.querySelector('[data-beacio-wizard-body]');
      expect(body?.textContent).toMatch(/MyApp/);
    });

    // SDK-01: an operatorName containing '&' (the flagship STORZ & BICKEL) must
    // surface in the DEFAULT body copy as a single, unescaped ampersand. The
    // earlier esc() helper HTML-entity-encoded the string and React then escaped
    // the entities a second time, so the literal "STORZ &amp; BICKEL" was shown.
    it('should not double-escape "&" in the default body (STORZ & BICKEL)', async () => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');

      const { container } = render(<InstallationWizard operatorName="STORZ & BICKEL" />);

      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      const body = container.querySelector('[data-beacio-wizard-body]');
      // The rendered text node carries the literal, once-decoded ampersand.
      expect(body?.textContent).toContain('STORZ & BICKEL');
      // ...and never the double-encoded form.
      expect(body?.textContent).not.toContain('STORZ &amp; BICKEL');
      // The serialized HTML must contain exactly one entity-encoded '&' for this
      // name (React's single escaping), never the double-encoded '&amp;amp;'.
      expect(body?.innerHTML).toContain('STORZ &amp; BICKEL');
      expect(body?.innerHTML).not.toContain('&amp;amp;');
    });

    it('should handle undefined onComplete', async () => {
      mockDetector.detectInstallState.mockResolvedValue('active');
      
      // Should not throw when onComplete is undefined
      expect(() => {
        render(<InstallationWizard />);
      }).not.toThrow();
    });

    it('should handle undefined className', async () => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');
      
      render(<InstallationWizard className={undefined} />);
      
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('should handle detection errors gracefully', async () => {
      mockDetector.detectInstallState.mockRejectedValue(new Error('Detection failed'));
      
      // Component should handle error internally — shows not-installed state
      render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });
    });
  });

  describe('Extension ready event', () => {
    it('should call onComplete when extension:ready event fires', async () => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');
      const onComplete = jest.fn();
      
      render(<InstallationWizard onComplete={onComplete} />);
      
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      // Simulate extension becoming ready
      act(() => {
        window.dispatchEvent(new Event('beacio:extension:ready'));
      });

      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('SB-PRD-03: iOS-26 enable + grant copy parity (web ↔ react)', () => {
    beforeEach(() => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');
    });

    it('AC2: names the per-origin grant GESTURE (aA → Manage Extensions → Allow Every Website)', async () => {
      const { container } = render(<InstallationWizard />);

      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      const text = (container.textContent || '').replace(/\s+/g, ' ');
      // The address-bar gesture, not just a menu-item name.
      expect(text).toMatch(/\baA\b|address bar/);
      expect(text).toContain('Manage Extensions');
      expect(text).toContain('Allow Every Website');
      // The first grant path (enable the extension in Settings) is also named.
      expect(text).toMatch(/Allow Extension|Safari Settings|Settings/);
    });

    it('AC3: names the first-scan Bluetooth permission step with its "why"', async () => {
      const { container } = render(<InstallationWizard />);

      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      const text = (container.textContent || '').replace(/\s+/g, ' ');
      expect(text).toMatch(/allow Bluetooth|Safari will ask.*Allow|tap Allow/i);
    });

    it('AC4: renders a VISIBLE return affordance whose href derives from beacio_return', async () => {
      const origin = 'https://app.storz-bickel.com/connect?session=abc';
      localStorageMock.setItem(
        'beacio_return',
        JSON.stringify({ url: origin, timestamp: Date.now() })
      );

      const { container } = render(<InstallationWizard />);

      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      const returnLink = container.querySelector('a[href]') as HTMLAnchorElement | null;
      expect(returnLink).not.toBeNull();
      expect(returnLink!.getAttribute('href')).toContain('app.storz-bickel.com');
      expect((returnLink!.textContent || '').trim().length).toBeGreaterThan(0);
    });
  });

  // SB-SDK-11: the wizard is themeable (tier-2 co-brand) — the same surface as the
  // @beacio/detect banner. A premium partner (Storz & Bickel) must be able to swap
  // the Apple-blue + beacio glyph + "Bluetooth Required" chrome for its own accent,
  // logo, and device-specific copy, plus the medical-market trust surfaces (a
  // VISIBLE "no data collected" line and a "not affiliated with the device maker"
  // microcopy). These FAIL on the current tree: the props do not exist (TS compile
  // error) and the themed DOM / visible-privacy / no-affiliation nodes are absent.
  describe('SB-SDK-11 themeable wizard (tier-2 co-brand)', () => {
    // jsdom normalizes inline-style hex colors to rgb(), so assertions are made
    // against the rgb forms: #007aff -> rgb(0, 122, 255); #c8102e -> rgb(200, 16, 46).
    const DEFAULT_ACCENT_RGB = 'rgb(0, 122, 255)';
    const PARTNER_ACCENT_RGB = 'rgb(200, 16, 46)';
    beforeEach(() => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');
    });

    it('AC1/AC2: applies the partner accent + logo <img> + device-specific copy', async () => {
      const { container } = render(
        <InstallationWizard
          operatorName="STORZ & BICKEL"
          accentColor="#c8102e"
          brandLogoUrl="https://app.storz-bickel.com/logo-sb.svg"
          deviceName="VOLCANO HYBRID"
          body="Connect your VOLCANO HYBRID in Safari to control it from app.storz-bickel.com."
        />
      );

      await waitFor(() => {
        expect(container.querySelector('[data-beacio-wizard-body]')).toBeInTheDocument();
      });

      // (1) the accent reaches the icon tile + the primary CTA (inline styles).
      const icon = container.querySelector('[data-beacio-wizard-icon]') as HTMLElement;
      const action = container.querySelector('[data-beacio-wizard-action]') as HTMLElement;
      expect(icon.style.background).toBe(PARTNER_ACCENT_RGB);
      expect(action.style.background).toBe(PARTNER_ACCENT_RGB);
      // The default Apple-blue is gone from those themed nodes.
      expect(icon.style.background).not.toBe(DEFAULT_ACCENT_RGB);
      expect(action.style.background).not.toBe(DEFAULT_ACCENT_RGB);

      // (2) the operator logo renders as an <img> and the beacio inline <svg> glyph is gone.
      const img = icon.querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('https://app.storz-bickel.com/logo-sb.svg');
      expect(icon.querySelector('svg')).toBeNull();

      // (3) the device-specific / overridden copy is shown.
      const body = container.querySelector('[data-beacio-wizard-body]');
      expect(body?.textContent).toContain('VOLCANO HYBRID');
      expect(body?.textContent).toContain('Connect your VOLCANO HYBRID in Safari');
    });

    it('AC3: surfaces a VISIBLE privacy line (outside <details>) + a "not affiliated" microcopy line', async () => {
      const { container } = render(
        <InstallationWizard operatorName="STORZ & BICKEL" accentColor="#c8102e" deviceName="VOLCANO HYBRID" />
      );

      await waitFor(() => {
        expect(container.querySelector('[data-beacio-wizard-body]')).toBeInTheDocument();
      });

      // A visible "No data collected" reassurance line NOT nested in a <details>.
      const visiblePrivacy = Array.from(container.querySelectorAll<HTMLElement>('*')).find(
        (n) =>
          /no data collected|processed locally|stays on your|never collected/i.test(n.textContent || '') &&
          n.closest('details') === null
      );
      expect(visiblePrivacy).toBeDefined();

      // A "not affiliated with the device maker" microcopy line (no-affiliation rule).
      expect(container.textContent || '').toMatch(/not affiliated|not made by|independent/i);
      // No App-Store-approved/cleared/audited language.
      expect(container.textContent || '').not.toMatch(/approved|cleared|audited|reviewed by/i);
    });

    it('AC2 (injection guard): a non-http brandLogoUrl renders NO <img> with that src', async () => {
      for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://x/y.svg']) {
        const { container, unmount } = render(
          <InstallationWizard operatorName="STORZ & BICKEL" accentColor="#c8102e" brandLogoUrl={bad} />
        );
        await waitFor(() => {
          expect(container.querySelector('[data-beacio-wizard-body]')).toBeInTheDocument();
        });
        const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
        expect(imgs.some((i) => (i.getAttribute('src') || '') === bad)).toBe(false);
        unmount();
      }
    });

    it('REGRESSION: omitting theme props preserves the default beacio theme', async () => {
      const { container } = render(<InstallationWizard operatorName="X" />);

      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });

      // Default Apple-blue accent on the icon tile; the beacio inline <svg> is present; no <img>.
      const icon = container.querySelector('[data-beacio-wizard-icon]') as HTMLElement;
      expect(icon.style.background).toBe(DEFAULT_ACCENT_RGB);
      expect(icon.querySelector('svg')).not.toBeNull();
      expect(container.querySelector('img')).toBeNull();
    });
  });

  describe('Re-detection behavior', () => {
    it('should only check once on mount', async () => {
      mockDetector.detectInstallState.mockResolvedValue('not-installed');
      
      const { rerender } = render(<InstallationWizard />);
      
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });
      
      expect(mockDetector.detectInstallState).toHaveBeenCalledTimes(1);
      
      // Re-render with same props
      rerender(<InstallationWizard />);
      
      // detect is called per mount via useEffect, but rerender doesn't remount
      // The constructor is called each render (not ideal, but matches current impl)
      expect(mockDetector.detectInstallState).toHaveBeenCalledTimes(1);
    });
  });

  describe('Async behavior', () => {
    it('should handle slow detection', async () => {
      let resolveDetection: (value: 'not-installed' | 'installed-inactive' | 'active') => void;
      const detectionPromise = new Promise<'not-installed' | 'installed-inactive' | 'active'>((resolve) => {
        resolveDetection = resolve;
      });
      
      mockDetector.detectInstallState.mockReturnValue(detectionPromise);
      
      const { container } = render(<InstallationWizard />);
      
      // Should render null while checking
      expect(container.innerHTML).toBe('');
      
      // Resolve detection as not installed
      await act(async () => {
        resolveDetection!('not-installed');
      });
      
      // Should show not-installed state
      await waitFor(() => {
        expect(screen.getByText('Bluetooth Required')).toBeInTheDocument();
      });
    });

    it('should handle rapid unmounting during detection', () => {
      mockDetector.detectInstallState.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      const { unmount } = render(<InstallationWizard />);
      
      // Should not throw when unmounting during detection
      expect(() => unmount()).not.toThrow();
    });

    it('should show finish setup CTA when extension is installed but inactive', async () => {
      mockDetector.detectInstallState.mockResolvedValue('installed-inactive');

      render(<InstallationWizard />);

      await waitFor(() => {
        expect(screen.getByText('Finish Safari Setup')).toBeInTheDocument();
      });
    });
  });
});
