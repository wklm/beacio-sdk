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

    it('should navigate to App Store when install button is clicked', async () => {
      const navigateSpy = jest
        .spyOn(InstallationWizardModule.navigationController, 'navigateToUrl')
        .mockImplementation(() => {});

      render(<InstallationWizard />);
      
      await waitFor(() => {
        const button = screen.getByText('Start Setup');
        fireEvent.click(button);
      });

      expect(navigateSpy).toHaveBeenCalledWith('https://ioswebble.com/setup.html');
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
        'ioswebble_dismiss_until',
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
      
      render(<InstallationWizard operatorName="MyApp" />);
      
      await waitFor(() => {
        expect(screen.getByText(/MyApp/)).toBeInTheDocument();
      });
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
        window.dispatchEvent(new Event('webble:extension:ready'));
      });

      expect(onComplete).toHaveBeenCalled();
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
