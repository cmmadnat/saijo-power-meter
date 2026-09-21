# Testing Guidelines for Saijo Smart Factory

## Overview
This document provides essential guidelines for testing the Saijo Smart Factory system using Playwright. These guidelines ensure consistent, thorough testing across all system components.

## Testing Environment Setup

### Required Tools
- **Playwright** - Primary E2E testing framework
- **Browser Support** - Chrome, Firefox, Safari, Mobile (iOS/Android)
- **Documentation** - Reference `/docs/testing/playwright-testing-guide.md`
- **Workflows** - Follow `/docs/testing/testing-workflows.md`

### Environment Configuration
```bash
# Environment variables for testing
export BASE_URL=http://localhost:8080
export TEST_USER_EMAIL=tester@saijo.com
export TEST_USER_PASSWORD=test123
export TEST_DATABASE_URL=firebase://test-project
```

## Core Testing Principles

### 1. Test Isolation
- Each test should be independent
- Clean state before/after each test
- No dependencies between test cases
- Use fresh test data for each run

### 2. Comprehensive Coverage
- **Unit Level**: Individual component testing
- **Integration Level**: API and service interaction
- **E2E Level**: Complete user workflows
- **Performance Level**: Load and response time validation

### 3. Real-World Scenarios
Focus on actual Smart Factory operations:
- Function test execution and validation
- Calorie meter data collection and analysis
- EMC testing procedures
- Data export and reporting workflows

## Testing Areas

### 1. Function Test Module
**Priority**: Critical
**Test Cases**:
- [ ] Test standard management
- [ ] Device configuration (Tablets, BOI equipment)
- [ ] Test execution workflows
- [ ] Results validation and reporting
- [ ] Error handling and recovery

### 2. Calorie Meter Room
**Priority**: High
**Test Cases**:
- [ ] Real-time data display
- [ ] Historical data retrieval
- [ ] Threshold monitoring
- [ ] Data export (CSV format)
- [ ] Alert system functionality

### 3. EMC Testing
**Priority**: High
**Test Cases**:
- [ ] EMC specification management
- [ ] Test parameter configuration
- [ ] Measurement recording
- [ ] Compliance validation
- [ ] Report generation

### 4. System Integration
**Priority**: Medium
**Test Cases**:
- [ ] User authentication and authorization
- [ ] Cross-module data sharing
- [ ] API endpoint validation
- [ ] Database consistency
- [ ] Performance under load

## Test Data Standards

### Function Test Data
```json
{
  "testStandard": "BOI Smart Factory - Function test Rv01",
  "deviceType": "Tablet",
  "testParameters": {
    "power": "12V",
    "connectivity": "WiFi",
    "display": "1920x1080"
  },
  "expectedResults": {
    "powerTest": "PASS",
    "connectivityTest": "PASS",
    "displayTest": "PASS"
  }
}
```

### Calorie Meter Data
```json
{
  "timestamp": "2024-08-30T12:00:00Z",
  "reading": 2405,
  "temperature": 22.5,
  "humidity": 65,
  "status": "NORMAL"
}
```

## API Testing Guidelines

### Authentication Testing
```javascript
// Validate API authentication
test('API authentication validation', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: {
      email: 'tester@saijo.com',
      password: 'test123'
    }
  });
  
  expect(response.ok()).toBeTruthy();
  const token = await response.json();
  expect(token.accessToken).toBeDefined();
});
```

### Data Validation Testing
```javascript
// Validate data integrity
test('Function test data validation', async ({ request }) => {
  const testData = {
    deviceId: 'TABLET-001',
    testStandard: 'BOI-001',
    parameters: {
      voltage: '12V',
      frequency: '60Hz'
    }
  };
  
  const response = await request.post('/api/function-test', {
    data: testData
  });
  
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.testId).toBeDefined();
  expect(result.status).toBe('CREATED');
});
```

## Performance Testing Standards

### Response Time Requirements
- **Page Load**: < 3 seconds
- **API Responses**: < 500ms
- **Data Export**: < 10 seconds
- **Real-time Updates**: < 1 second

### Load Testing Scenarios
- **Concurrent Users**: Up to 50 simultaneous users
- **Data Processing**: Handle 1000+ test records
- **File Uploads**: Support files up to 10MB
- **Session Management**: 8-hour work sessions

## Error Handling Validation

### Network Failures
```javascript
test('Handle network connectivity issues', async ({ page }) => {
  // Simulate network failure
  await page.route('/api/**', route => route.abort());
  
  await page.goto('/function-test');
  
  // Verify graceful error handling
  await expect(page.getByText('Connection lost')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
```

### Input Validation
```javascript
test('Validate required field handling', async ({ page }) => {
  await page.goto('/function-test/new');
  
  // Submit without required fields
  await page.getByRole('button', { name: 'Create Test' }).click();
  
  // Verify validation messages
  await expect(page.getByText('Device type is required')).toBeVisible();
  await expect(page.getByText('Test standard must be selected')).toBeVisible();
});
```

## Security Testing

### Authentication Security
- [ ] Session timeout validation
- [ ] Invalid credential handling
- [ ] Password strength requirements
- [ ] Multi-session management

### Data Security
- [ ] SQL injection prevention
- [ ] XSS attack prevention
- [ ] CSRF protection
- [ ] Data encryption validation

## Mobile Testing Considerations

### Responsive Design
- [ ] Layout adapts to screen size
- [ ] Touch interactions work properly
- [ ] Navigation is accessible
- [ ] Performance on mobile devices

### Device-Specific Testing
- [ ] iOS Safari compatibility
- [ ] Android Chrome compatibility
- [ ] Tablet-specific interfaces
- [ ] Orientation change handling

## Accessibility Testing

### WCAG Compliance
- [ ] Keyboard navigation support
- [ ] Screen reader compatibility
- [ ] Color contrast requirements
- [ ] Focus management
- [ ] Alternative text for images

## Test Reporting

### Daily Reports
Generate automated reports including:
- Test execution summary
- Pass/fail statistics
- Performance metrics
- Error logs and screenshots

### Weekly Analysis
- Test coverage analysis
- Performance trend tracking
- Failed test pattern analysis
- Improvement recommendations

## Best Practices Summary

1. **Test Early and Often** - Run tests with every code change
2. **Maintain Test Data** - Keep test data current and realistic
3. **Document Issues** - Clear bug reports with screenshots and steps
4. **Review Regularly** - Update tests as system evolves
5. **Collaborate** - Work closely with development team
6. **Automate When Possible** - Reduce manual testing overhead

## Emergency Procedures

### Critical System Failures
1. Stop all automated tests
2. Document failure symptoms
3. Notify development team immediately
4. Preserve system state for debugging
5. Switch to manual validation if needed

### Data Corruption Issues
1. Stop data modification tests
2. Backup current test database
3. Validate data integrity
4. Report to data team
5. Use backup test environment

## Continuous Improvement

### Monthly Reviews
- Evaluate test effectiveness
- Update test scenarios for new features
- Optimize test execution time
- Review and update documentation

### Quality Metrics
- Test coverage percentage
- Defect detection rate
- Test execution time
- False positive rate

---

**Remember**: Quality testing ensures reliable operation of the Saijo Smart Factory system. When in doubt, ask questions and document everything!