/**
 * OpenAI Function Definitions for IQCalorie Bot
 * These functions enable the LLM to act as a ReAct agent
 */

const getFunctionDefinitions = () => [
  {
    type: 'function',
    function: {
      name: 'add_meal',
      description: 'ALWAYS CALL THIS TOOL TO LOG A NEW MEAL. Log a new meal with nutritional breakdown. Call this when the user mentions eating food, describes a meal, or sends a food photo.',
      parameters: {
        type: 'object',
        properties: {
          meal_description: {
            type: 'string',
            description: 'Brief description of the meal (e.g., "Grilled chicken with rice and broccoli")'
          },
          calories: {
            type: 'number',
            description: 'Total estimated calories in kcal'
          },
          protein: {
            type: 'number',
            description: 'Protein content in grams'
          },
          carbs: {
            type: 'number',
            description: 'Carbohydrates content in grams'
          },
          fats: {
            type: 'number',
            description: 'Fats content in grams'
          },
          meal_type: {
            type: 'string',
            enum: ['breakfast', 'lunch', 'dinner', 'snack'],
            description: 'Type of meal'
          }
        },
        required: ['meal_description', 'calories', 'protein', 'carbs', 'fats']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'update_meal',
      description: 'ALWAYS CALL THIS TOOL TO UPDATE A MEAL. Update a previously logged meal. IMPORTANT: First call get_meal_history to see all meals with their meal_numbers, then use the meal_number to identify which meal to update.',
      parameters: {
        type: 'object',
        properties: {
          meal_identifier: {
            type: 'string',
            description: 'The meal_number from get_meal_history (e.g., "1", "2", "3"). This identifies which meal of the day to update based on chronological order.'
          },
          new_description: {
            type: 'string',
            description: 'New meal description (optional, only if changing the description)'
          },
          new_calories: {
            type: 'number',
            description: 'Updated calories (optional)'
          },
          new_protein: {
            type: 'number',
            description: 'Updated protein in grams (optional)'
          },
          new_carbs: {
            type: 'number',
            description: 'Updated carbs in grams (optional)'
          },
          new_fats: {
            type: 'number',
            description: 'Updated fats in grams (optional)'
          }
        },
        required: ['meal_identifier']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'delete_meal',
      description: 'Remove a meal from today\'s log. IMPORTANT: First call get_meal_history to see all meals with their meal_numbers, then use the meal_number to identify which meal to delete.',
      parameters: {
        type: 'object',
        properties: {
          meal_identifier: {
            type: 'string',
            description: 'The meal_number from get_meal_history (e.g., "1", "2", "3"). This identifies which meal of the day to delete based on chronological order.'
          }
        },
        required: ['meal_identifier']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'show_daily_progress',
      description: 'Show the user\'s current daily nutrition progress with macro breakdown. Use traffic light indicators (🟢 under goal, 🟡 near goal, 🔴 over goal).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_meal_history',
      description: 'Show a list of all meals logged today with their macros.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Show the user their current profile information including name, fitness goal, diet preference, weight, height, activity level, and daily nutrition targets.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_dashboard_link',
      description: 'Generate a personalized dashboard link for the user to manage their profile, goals, and subscription settings.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

module.exports = { getFunctionDefinitions };
