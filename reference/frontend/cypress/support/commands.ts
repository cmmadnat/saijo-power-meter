// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

/// <reference types="cypress" />

// Custom command to test API endpoints
Cypress.Commands.add('testApiEndpoint', (method: string, url: string, options: any = {}) => {
  const apiUrl = Cypress.env('apiUrl') || 'http://localhost:8080'
  const fullUrl = `${apiUrl}${url}`

  return cy.request({
    method,
    url: fullUrl,
    failOnStatusCode: false,
    ...options
  })
})

declare global {
  namespace Cypress {
    interface Chainable {
      testApiEndpoint(method: string, url: string, options?: any): Chainable<Response<any>>
    }
  }
}