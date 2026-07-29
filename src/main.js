import { Game } from './core/Game.js'

/**
 * Main entry point
 * Initialize the game when DOM is ready
 */
async function main() {
  console.log('Starting Interactive Portfolio...')

  // Create and initialize game
  const game = new Game()

  try {
    await game.init()
    console.log('Game initialized successfully!')
  } catch (error) {
    console.error('Failed to initialize game:', error)

    // Show error to user
    const loading = document.getElementById('loading')
    if (loading) {
      loading.innerHTML = `
        <div class="loading-content">
          <h1>Error Loading</h1>
          <p style="color: #ff6b6b; margin-top: 1rem;">
            ${error.message || 'Failed to initialize the game.'}
          </p>
          <p style="color: rgba(255,255,255,0.6); margin-top: 0.5rem; font-size: 0.875rem;">
            Check console for details.
          </p>
        </div>
      `
    }
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
