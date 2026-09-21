/// <reference types="cypress" />

/**
 * UI Navigation Tests
 * Verifies the frontend UI loads and basic navigation works
 */

describe('UI Navigation', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should load the main application', () => {
    cy.url().should('include', 'localhost:5173')
    cy.get('body').should('be.visible')
  })

  it('should display the main navigation', () => {
    // Check for navigation elements - adjust selectors based on actual UI
    cy.get('nav, [role="navigation"], .navigation, .nav').should('exist')
  })

  it('should have Function Test Module accessible', () => {
    // Check if Function Test Module link/button exists
    cy.contains(/function test|Function Test/i).should('be.visible')
  })

  it('should have Calorie Meter Module accessible', () => {
    // Check if Calorie Meter Module link/button exists
    cy.contains(/calorie meter|Calorie Meter/i).should('be.visible')
  })

  it('should have EMC Module accessible', () => {
    // Check if EMC Module link/button exists
    cy.contains(/emc|EMC/i).should('be.visible')
  })

  it('should navigate to Function Test Module', () => {
    cy.contains(/function test|Function Test/i).click()
    cy.url().should('include', '/function-test')
    cy.get('h1, h2, .page-title').should('contain', 'Function Test')
  })

  it('should navigate to Calorie Meter Module', () => {
    cy.contains(/calorie meter|Calorie Meter/i).click()
    cy.url().should('include', '/calorie-meter')
    cy.get('h1, h2, .page-title').should('contain', 'Calorie')
  })

  it('should navigate to EMC Module', () => {
    cy.contains(/emc|EMC/i).click()
    cy.url().should('include', '/emc')
    cy.get('h1, h2, .page-title').should('contain', 'EMC')
  })
})