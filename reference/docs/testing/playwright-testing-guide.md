# Playwright Testing Guide for Saijo Backend Project

## Overview
This guide provides comprehensive instructions for using Playwright to test the Saijo Smart Factory system. As a tester, you'll use this documentation to perform E2E testing, validate functionality, and ensure quality across all system components.

## Playwright Setup and Configuration

### Prerequisites
- Node.js 18+ installed
- Access to the Saijo backend system
- Understanding of the Smart Factory domain (Function Tests, Calorie Meter Room, EMC)

### Installation
```bash
# Install Playwright
npm install -D @playwright/test

# Install browsers
npx playwright install
```

### Configuration (playwright.config.js)
```javascript
module.exports = {
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 12'] }
    }
  ]
};
```

## Common Testing Tasks

### 1. Basic Page Navigation and Verification

```javascript
// tests/basic-navigation.spec.js
import { test, expect } from '@playwright/test';

test('Navigate to Smart Factory dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Smart Factory/);
  await expect(page.locator('h1')).toContainText('Saijo Smart Factory');
});

test('Verify main navigation menu', async ({ page }) => {
  await page.goto('/');
  
  // Check main navigation items
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Function Test' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Calorie Meter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'EMC' })).toBeVisible();
});
```

### 2. Function Test Module Testing

```javascript
// tests/function-test-module.spec.js
import { test, expect } from '@playwright/test';

test.describe('Function Test Module', () => {
  test('Access function test interface', async ({ page }) => {
    await page.goto('/function-test');
    await expect(page.locator('h2')).toContainText('Function Test');
    
    // Verify test standards are loaded
    await expect(page.getByText('Test Standards')).toBeVisible();
    await expect(page.locator('.test-standards-list')).toBeVisible();
  });

  test('Create new function test', async ({ page }) => {
    await page.goto('/function-test');
    await page.getByRole('button', { name: 'New Test' }).click();
    
    // Fill test form
    await page.getByLabel('Test Name').fill('Automated Test Sample');
    await page.getByLabel('Device Type').selectOption('Tablet');
    await page.getByLabel('Test Standard').selectOption('BOI-001');
    
    // Submit and verify
    await page.getByRole('button', { name: 'Create Test' }).click();
    await expect(page.getByText('Test created successfully')).toBeVisible();
  });

  test('Execute function test workflow', async ({ page }) => {
    await page.goto('/function-test');
    
    // Start test execution
    await page.getByRole('button', { name: 'Start Test' }).click();
    await expect(page.getByText('Test in progress')).toBeVisible();
    
    // Wait for test completion
    await page.waitForSelector('.test-complete', { timeout: 60000 });
    
    // Verify results
    await expect(page.getByText('Test Results')).toBeVisible();
    await expect(page.locator('.test-results')).toBeVisible();
  });
});
```

### 3. Calorie Meter Room Testing

```javascript
// tests/calorie-meter.spec.js
import { test, expect } from '@playwright/test';

test.describe('Calorie Meter Room', () => {
  test('Monitor calorie meter readings', async ({ page }) => {
    await page.goto('/calorie-meter');
    
    // Verify real-time data display
    await expect(page.locator('.calorie-display')).toBeVisible();
    await expect(page.getByText('Current Reading')).toBeVisible();
    
    // Check data refresh
    const initialReading = await page.locator('.current-value').textContent();
    await page.waitForTimeout(5000); // Wait for data refresh
    const updatedReading = await page.locator('.current-value').textContent();
    
    // Readings should update (or at least display consistently)
    expect(updatedReading).toBeDefined();
  });

  test('Export calorie meter data', async ({ page }) => {
    await page.goto('/calorie-meter');
    
    // Set date range for export
    await page.getByLabel('Start Date').fill('2024-08-01');
    await page.getByLabel('End Date').fill('2024-08-30');
    
    // Trigger export
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toMatch(/AirTest.*\.csv/);
  });
});
```

### 4. API Testing Integration

```javascript
// tests/api-integration.spec.js
import { test, expect } from '@playwright/test';

test.describe('API Integration Tests', () => {
  test('Validate test standards API', async ({ request }) => {
    const response = await request.get('/api/test-standards');
    expect(response.ok()).toBeTruthy();
    
    const standards = await response.json();
    expect(Array.isArray(standards)).toBeTruthy();
    expect(standards.length).toBeGreaterThan(0);
  });

  test('Submit test results via API', async ({ request }) => {
    const testData = {
      testId: 'TEST-001',
      deviceType: 'Tablet',
      results: {
        passed: 8,
        failed: 2,
        status: 'completed'
      }
    };

    const response = await request.post('/api/test-results', {
      data: testData
    });
    
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
```

## Advanced Testing Scenarios

### 1. Multi-Device Testing
```javascript
// tests/multi-device.spec.js
import { test, expect } from '@playwright/test';

test.describe('Multi-Device Compatibility', () => {
  ['Desktop Chrome', 'iPhone 12', 'iPad'].forEach(deviceName => {
    test(`Function test on ${deviceName}`, async ({ page, browser }) => {
      const context = await browser.newContext({
        ...devices[deviceName]
      });
      const devicePage = await context.newPage();
      
      await devicePage.goto('/function-test');
      await expect(devicePage.locator('h2')).toBeVisible();
      
      // Device-specific assertions
      if (deviceName.includes('iPhone')) {
        await expect(devicePage.locator('.mobile-menu')).toBeVisible();
      }
    });
  });
});
```

### 2. Performance Testing
```javascript
// tests/performance.spec.js
import { test, expect } from '@playwright/test';

test('Performance metrics validation', async ({ page }) => {
  await page.goto('/');
  
  // Measure page load time
  const startTime = Date.now();
  await page.waitForLoadState('networkidle');
  const loadTime = Date.now() - startTime;
  
  expect(loadTime).toBeLessThan(5000); // 5 second threshold
  
  // Check for performance entries
  const performanceEntries = await page.evaluate(() => {
    return performance.getEntriesByType('navigation')[0];
  });
  
  expect(performanceEntries.loadEventEnd - performanceEntries.loadEventStart)
    .toBeLessThan(3000);
});
```

### 3. Error Handling Validation
```javascript
// tests/error-handling.spec.js
import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('Handle network failures gracefully', async ({ page }) => {
    // Simulate network failure
    await page.route('/api/**', route => route.abort());
    
    await page.goto('/function-test');
    
    // Verify error message display
    await expect(page.getByText('Connection error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('Validate input errors', async ({ page }) => {
    await page.goto('/function-test');
    await page.getByRole('button', { name: 'New Test' }).click();
    
    // Submit empty form
    await page.getByRole('button', { name: 'Create Test' }).click();
    
    // Check validation messages
    await expect(page.getByText('Test name is required')).toBeVisible();
    await expect(page.getByText('Device type must be selected')).toBeVisible();
  });
});
```

## Test Data Management

### Test Data Setup
```javascript
// utils/test-data.js
export const testData = {
  functionTest: {
    standard: {
      name: 'BOI Smart Factory - Function test Rv01',
      deviceType: 'Tablet',
      parameters: ['Power', 'Connectivity', 'Display']
    }
  },
  calorieMeters: {
    sampleReadings: [
      { timestamp: '2024-08-25T10:00:00Z', value: 2400 },
      { timestamp: '2024-08-25T10:01:00Z', value: 2405 }
    ]
  }
};

export async function setupTestData(page) {
  await page.addInitScript(() => {
    window.testMode = true;
  });
}
```

### Database State Management
```javascript
// utils/db-helpers.js
export async function cleanupTestData(page) {
  await page.evaluate(() => {
    // Clear localStorage
    localStorage.clear();
    
    // Reset any test state
    if (window.testCleanup) {
      window.testCleanup();
    }
  });
}

export async function seedTestData(page, data) {
  await page.addInitScript((testData) => {
    window.testData = testData;
  }, data);
}
```

## Reporting and Documentation

### Test Execution Reports
```javascript
// playwright.config.js reporter configuration
module.exports = {
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results.xml' }]
  ]
};
```

### Custom Test Annotations
```javascript
test('Critical path: Complete function test workflow', async ({ page }) => {
  test.slow(); // Mark as slow test
  await test.step('Navigate to function test', async () => {
    await page.goto('/function-test');
  });
  
  await test.step('Create new test', async () => {
    // Test creation steps
  });
  
  await test.step('Execute test', async () => {
    // Test execution steps
  });
});
```

## Best Practices for Testers

### 1. Test Organization
- Group related tests in describe blocks
- Use descriptive test names that explain the scenario
- Follow the AAA pattern (Arrange, Act, Assert)

### 2. Selector Strategy
- Prefer role-based selectors: `page.getByRole('button', { name: 'Submit' })`
- Use test IDs for complex elements: `data-testid="function-test-form"`
- Avoid CSS selectors that may break with UI changes

### 3. Assertions
- Use specific assertions: `toHaveText()` vs `toContainText()`
- Verify both positive and negative cases
- Check element states (visible, enabled, etc.)

### 4. Test Maintenance
- Keep tests independent and isolated
- Use page object models for complex workflows
- Regular review and update of test scenarios

## Troubleshooting Common Issues

### Browser Installation Issues
```bash
# Reinstall browsers
npx playwright install --force

# Install specific browser
npx playwright install chromium
```

### Test Timeouts
```javascript
// Increase timeout for specific operations
await page.waitForSelector('.slow-element', { timeout: 60000 });

// Set test-level timeout
test.setTimeout(120000);
```

### Debugging Failed Tests
```bash
# Run tests in headed mode
npx playwright test --headed

# Debug mode with browser dev tools
npx playwright test --debug

# Generate trace for failed tests
npx playwright show-trace trace.zip
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Playwright Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Install Playwright browsers
      run: npx playwright install --with-deps
    - name: Run Playwright tests
      run: npx playwright test
    - uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
```

This documentation serves as your comprehensive guide for testing the Saijo Smart Factory system with Playwright. Reference this document for all testing activities and update it as the system evolves.