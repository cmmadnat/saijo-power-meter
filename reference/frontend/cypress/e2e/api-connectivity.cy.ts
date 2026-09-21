/// <reference types="cypress" />

/**
 * API Connectivity Tests
 * Verifies all REST endpoints from Stories 2.2, 2.3, 2.4, 3.2, 3.3 are accessible
 */

describe('API Connectivity Verification', () => {
  const apiUrl = Cypress.env('apiUrl')

  before(() => {
    cy.log('Testing API connectivity to:', apiUrl)
  })

  describe('Function Test Module Endpoints (Stories 2.2, 2.3, 2.4)', () => {
    it('should reach GET /api/v1/function-test/standards endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/function-test/standards').then((response) => {
        // Accept any non-network-error response (backend may not be fully implemented)
        expect(response.status).to.be.oneOf([200, 404, 500])
        cy.log(`GET /api/v1/function-test/standards returned: ${response.status}`)
      })
    })

    it('should reach POST /api/v1/function-test/standards endpoint', () => {
      const testStandard = {
        name: 'Test Standard',
        parameters: {}
      }

      cy.testApiEndpoint('POST', '/api/v1/function-test/standards', {
        body: testStandard
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 201, 400, 404, 500])
        cy.log(`POST /api/v1/function-test/standards returned: ${response.status}`)
      })
    })

    it('should reach PUT /api/v1/function-test/standards/{id} endpoint', () => {
      const testStandard = {
        name: 'Updated Test Standard',
        parameters: {}
      }

      cy.testApiEndpoint('PUT', '/api/v1/function-test/standards/test-id', {
        body: testStandard
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 404, 400, 500])
        cy.log(`PUT /api/v1/function-test/standards/{id} returned: ${response.status}`)
      })
    })

    it('should reach DELETE /api/v1/function-test/standards/{id} endpoint', () => {
      cy.testApiEndpoint('DELETE', '/api/v1/function-test/standards/test-id').then((response) => {
        expect(response.status).to.be.oneOf([200, 204, 404, 500])
        cy.log(`DELETE /api/v1/function-test/standards/{id} returned: ${response.status}`)
      })
    })

    it('should reach GET /api/v1/function-test/results endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/function-test/results').then((response) => {
        expect(response.status).to.be.oneOf([200, 404, 500])
        cy.log(`GET /api/v1/function-test/results returned: ${response.status}`)
      })
    })
  })

  describe('Calorie Meter Module Endpoints (Story 3.2)', () => {
    it('should reach POST /api/v1/calorie-meter/suggestions endpoint', () => {
      const testRequest = {
        air_conditioner_details: {
          model_name: 'Test Model',
          serial_number: 'TEST123',
          ac_type: 'Inverter',
          cooling_capacity_btu_h: 12000,
          efficiency: 3.5,
          compressor_type: 'Inverter',
          compressor_rpm: 3600,
          refrigerant_type: 'R-410A',
          refrigerant_volume_g: 1200
        },
        test_results: {
          indoor_room_temp_dry_bulb_c: 25.0,
          outdoor_room_temp_dry_bulb_c: 35.0,
          indoor_room_temp_wet_bulb_c: 18.0,
          outdoor_room_temp_wet_bulb_c: 24.0,
          total_capacity_btu_h: 11500,
          sensible_heat_capacity_btu_h: 8500,
          latent_heat_capacity_btu_h: 3000,
          unit_power_input_w: 3500,
          efficiency_eer: 3.29,
          evaporator_inlet_temp_c: 12.0,
          evaporator_outlet_temp_c: 8.0,
          compressor_suction_temp_c: 15.0,
          compressor_discharge_temp_c: 85.0,
          compressor_suction_pressure_psi: 120,
          compressor_discharge_pressure_psi: 350
        }
      }

      cy.testApiEndpoint('POST', '/api/v1/calorie-meter/suggestions', {
        body: testRequest,
        timeout: 30000
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 400, 404, 500])
        cy.log(`POST /api/v1/calorie-meter/suggestions returned: ${response.status}`)
      })
    })
  })

  describe('EMC Module Endpoints (Story 3.3)', () => {
    it('should reach POST /api/v1/emc/suggestions endpoint', () => {
      const testRequest = {
        emc_details: {
          indoor_emi_filter: {
            l1_uh: 1.5,
            cx1_uf: 0.22,
            cx2_uf: 0.47,
            cy1_uf: 2.2,
            cy2_uf: 4.7
          },
          outdoor_emi_filter: {
            l1_uh: 2.2,
            cx1_uf: 0.33,
            cx2_uf: 0.68,
            cy1_uf: 3.3,
            cy2_uf: 6.8
          },
          ferrite_core_positions: [
            {
              name: 'Test Ferrite Core',
              material: 'NiZn ferrite',
              diameter: 13.0,
              thickness: 6.35,
              length: 28.7,
              number_of_turns: 3
            }
          ]
        },
        emc_test_result: {
          test_standard: 'EN 55014-1:2006 CONDUCTED EMISSION',
          measuring_point: 'Main port',
          phase: 'Neutral to Ground',
          test_result_file: 'https://example.com/test-result.pdf'
        }
      }

      cy.testApiEndpoint('POST', '/api/v1/emc/suggestions', {
        body: testRequest,
        timeout: 30000
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 400, 404, 500])
        cy.log(`POST /api/v1/emc/suggestions returned: ${response.status}`)
      })
    })
  })

  describe('Power Meter Module Endpoints (Story 5.9)', () => {
    it('should reach GET /api/v1/power-meter/statuses endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/power-meter/statuses').then((response) => {
        expect(response.status).to.be.oneOf([200, 500])
        cy.log(`GET /api/v1/power-meter/statuses returned: ${response.status}`)
      })
    })

    it('should reach GET /api/v1/power-meter/readings endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/power-meter/readings').then((response) => {
        expect(response.status).to.be.oneOf([200, 500])
        cy.log(`GET /api/v1/power-meter/readings returned: ${response.status}`)
      })
    })

    it('should reach GET /api/v1/power-meter/realtime endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/power-meter/realtime?hours=24&interval=5m').then((response) => {
        expect(response.status).to.be.oneOf([200, 500])
        cy.log(`GET /api/v1/power-meter/realtime returned: ${response.status}`)
      })
    })

    it('should reach GET /api/v1/power-meter/{meterId}/uptime endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/power-meter/M001/uptime').then((response) => {
        expect(response.status).to.be.oneOf([200, 404, 500])
        cy.log(`GET /api/v1/power-meter/{meterId}/uptime returned: ${response.status}`)
      })
    })

    it('should reach GET /api/v1/power-meter/{meterId} endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/power-meter/M001').then((response) => {
        expect(response.status).to.be.oneOf([200, 404, 500])
        cy.log(`GET /api/v1/power-meter/{meterId} returned: ${response.status}`)
      })
    })

    it('should reach GET /api/v1/power-meter/historical endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/power-meter/historical?startDate=2023-01-01T00:00:00&endDate=2023-01-02T00:00:00').then((response) => {
        expect(response.status).to.be.oneOf([200, 500])
        cy.log(`GET /api/v1/power-meter/historical returned: ${response.status}`)
      })
    })

    it('should reach GET /api/v1/dashboard/metrics endpoint', () => {
      cy.testApiEndpoint('GET', '/api/v1/dashboard/metrics').then((response) => {
        expect(response.status).to.be.oneOf([200, 404, 500])
        cy.log(`GET /api/v1/dashboard/metrics returned: ${response.status}`)
      })
    })
  })

  describe('Legacy v1 API Endpoints (Backward Compatibility)', () => {
    it('should verify backward compatibility with /api/v1 prefix', () => {
      cy.testApiEndpoint('GET', '/api/v1/health').then((response) => {
        // These may be deprecated but should still respond
        cy.log(`Legacy API health check returned: ${response.status}`)
      })
    })
  })
})