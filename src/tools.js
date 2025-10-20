/**
 * Tool Execution Layer for IQCalorie Bot
 * Handles all function calls from the LLM
 */

// ============================================================================
// HELPER: Format Progress Bars with Traffic Light Indicators
// ============================================================================

const formatProgressBars = (used, goals) => {
  const kcalPct = Math.round((used.kcal / goals.kcal) * 100);
  const protPct = Math.round((used.prot / goals.prot) * 100);
  const carbPct = Math.round((used.carb / goals.carb) * 100);
  const fatPct = Math.round((used.fat / goals.fat) * 100);

  // Traffic light function: 🟢 under goal, 🟠 near goal, 🔴 over goal
  function getTrafficLight(percentage) {
    if (percentage >= 95) return '🔴';
    if (percentage > 70) return '🟠';
    return '🟢';
  }

  return `🔥${getTrafficLight(kcalPct)} *Calories:* ${used.kcal}/${goals.kcal} kcal
🥩${getTrafficLight(protPct)} *Proteins:* ${used.prot}/${goals.prot} g
🥔${getTrafficLight(carbPct)} *Carbs:* ${used.carb}/${goals.carb} g
🧈${getTrafficLight(fatPct)} *Fats:* ${used.fat}/${goals.fat} g`;
};

const executeTool = async (functionName, args, context) => {
  const { phone, userProfile, db, today, redisClient } = context;

  console.log(`🔧 Executing tool: ${functionName}`, args);

  try {
    switch (functionName) {
      case 'add_meal':
        return await addMealTool(args, { phone, db, today });

      case 'update_meal':
        return await updateMealTool(args, { phone, db, today, redisClient });

      case 'delete_meal':
        return await deleteMealTool(args, { phone, db, today, redisClient });

      case 'show_daily_progress':
        return await showProgressTool({ phone, db, today });

      case 'get_meal_history':
        return await getMealHistoryTool({ phone, db, today });

      case 'get_dashboard_link':
        return await getDashboardLinkTool({ phone });

      default:
        console.error(`❌ Unknown function: ${functionName}`);
        return { success: false, error: `Unknown function: ${functionName}` };
    }
  } catch (error) {
    console.error(`❌ Tool execution error in ${functionName}:`, error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// ADD MEAL TOOL
// ============================================================================

const addMealTool = async (args, context) => {
  const { phone, db, today } = context;
  const { meal_description, calories, protein, carbs, fats, meal_type } = args;

  try {
    console.log('📝 Adding meal:', { meal_description, calories, protein, carbs, fats });

    // Insert into meal_logs
    const { data, error } = await db
      .from('meal_logs')
      .insert({
        user_phone: phone,
        meal_description,
        kcal: calories,
        prot: protein,
        carb: carbs,
        fat: fats,
        created_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('❌ Error inserting meal:', error);
      throw new Error(`Failed to insert meal: ${error.message}`);
    }

    // Update daily totals
    const rpcError = await db.rpc('increment_daily_totals', {
      p_phone: phone,
      p_date: today,
      p_kcal: calories,
      p_prot: protein,
      p_carb: carbs,
      p_fat: fats
    });

    if (rpcError.error) {
      console.error('❌ Error updating daily totals:', rpcError.error);
      throw new Error(`Failed to update totals: ${rpcError.error.message}`);
    }

    // Get updated progress
    const { data: userData, error: fetchError } = await db.rpc('get_user_data', {
      p_phone: phone,
      p_date: today
    });

    if (fetchError) {
      console.error('❌ Error fetching updated data:', fetchError);
      throw new Error(`Failed to fetch updated data: ${fetchError.message}`);
    }

    const row = userData?.[0];
    if (!row) {
      throw new Error('User data not found after meal insertion');
    }

    console.log('✅ Meal added successfully');

    // Format progress bars for response
    const formattedBars = formatProgressBars(
      { kcal: row.kcal_used, prot: row.prot_used, carb: row.carb_used, fat: row.fat_used },
      { kcal: row.kcal_goal, prot: row.prot_goal, carb: row.carb_goal, fat: row.fat_goal }
    );

    return {
      success: true,
      meal: {
        description: meal_description,
        calories,
        protein,
        carbs,
        fats,
        meal_type: meal_type || 'meal'
      },
      daily_progress: {
        calories_used: Math.round(row.kcal_used),
        calories_goal: row.kcal_goal,
        protein_used: Math.round(row.prot_used),
        protein_goal: row.prot_goal,
        carbs_used: Math.round(row.carb_used),
        carbs_goal: row.carb_goal,
        fats_used: Math.round(row.fat_used),
        fats_goal: row.fat_goal
      },
      formatted_progress: formattedBars,
      response_instructions: `Format your response using this exact structure:

✅ *Meal logged successfully!*

🍽️ *<MealType>:* <brief label>

🔥 *Calories:* <kcal> kcal
🥩 *Proteins:* <g> g
🥔 *Carbs:* <g> g
🧈 *Fats:* <g> g

📝 *Assumptions:* give precise size and portion measurements with units in g/oz/mL, comma-separated, end with "Let me know if you'd like any adjustments 🙂"

⏳ *Daily Progress:*
${formattedBars}

<one motivational sentence + ask them how they are feeling about their progress + relevant emoji>`
    };
  } catch (error) {
    console.error('❌ Add meal error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// UPDATE MEAL TOOL
// ============================================================================

const updateMealTool = async (args, context) => {
  const { phone, db, today, redisClient } = context;
  const { meal_identifier, new_description, new_calories, new_protein, new_carbs, new_fats } = args;

  let tempKey = null;

  try {
    console.log('🔄 Updating meal:', { meal_identifier, new_calories, new_protein, new_carbs, new_fats });

    // Create temp key for tracking
    tempKey = `temp:meals:${phone}:${Date.now()}`;

    // Get recent meals to find which one to update
    const { data: recentMeals, error: fetchError } = await db
      .from('meal_logs')
      .select('*')
      .eq('user_phone', phone)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch recent meals: ${fetchError.message}`);
    }

    if (!recentMeals || recentMeals.length === 0) {
      return {
        success: false,
        error: 'No meals found today to update. Try logging a meal first!'
      };
    }

    // Cache meal data in Redis for context
    if (redisClient) {
      await redisClient.setEx(tempKey, 300, JSON.stringify(recentMeals));
    }

    // Find the meal to update based on identifier
    let mealToUpdate = recentMeals[0]; // Default to most recent

    if (meal_identifier && meal_identifier.toLowerCase() !== 'most recent') {
      // Try to find meal by description or type
      const identifier = meal_identifier.toLowerCase();
      const found = recentMeals.find(m =>
        m.meal_description.toLowerCase().includes(identifier) ||
        identifier.includes(m.meal_description.toLowerCase().split(' ')[0])
      );
      if (found) {
        mealToUpdate = found;
      }
    }

    // Calculate changes for daily totals
    const caloriesDiff = (new_calories || mealToUpdate.kcal) - mealToUpdate.kcal;
    const proteinDiff = (new_protein || mealToUpdate.prot) - mealToUpdate.prot;
    const carbsDiff = (new_carbs || mealToUpdate.carb) - mealToUpdate.carb;
    const fatsDiff = (new_fats || mealToUpdate.fat) - mealToUpdate.fat;

    // Update the meal
    const { error: updateError } = await db
      .from('meal_logs')
      .update({
        meal_description: new_description || mealToUpdate.meal_description,
        kcal: new_calories || mealToUpdate.kcal,
        prot: new_protein || mealToUpdate.prot,
        carb: new_carbs || mealToUpdate.carb,
        fat: new_fats || mealToUpdate.fat,
        updated_at: new Date().toISOString()
      })
      .eq('id', mealToUpdate.id);

    if (updateError) {
      throw new Error(`Failed to update meal: ${updateError.message}`);
    }

    // Update daily totals if macros changed
    if (caloriesDiff !== 0 || proteinDiff !== 0 || carbsDiff !== 0 || fatsDiff !== 0) {
      const rpcError = await db.rpc('increment_daily_totals', {
        p_phone: phone,
        p_date: today,
        p_kcal: caloriesDiff,
        p_prot: proteinDiff,
        p_carb: carbsDiff,
        p_fat: fatsDiff
      });

      if (rpcError.error) {
        throw new Error(`Failed to update daily totals: ${rpcError.error.message}`);
      }
    }

    // Get updated progress
    const { data: userData, error: fetchNewError } = await db.rpc('get_user_data', {
      p_phone: phone,
      p_date: today
    });

    if (fetchNewError) {
      throw new Error(`Failed to fetch updated data: ${fetchNewError.message}`);
    }

    const row = userData?.[0];
    if (!row) {
      throw new Error('User data not found after meal update');
    }

    console.log('✅ Meal updated successfully');

    // Format progress bars for response
    const formattedBars = formatProgressBars(
      { kcal: row.kcal_used, prot: row.prot_used, carb: row.carb_used, fat: row.fat_used },
      { kcal: row.kcal_goal, prot: row.prot_goal, carb: row.carb_goal, fat: row.fat_goal }
    );

    return {
      success: true,
      message: 'Meal updated successfully!',
      old_meal: {
        description: mealToUpdate.meal_description,
        calories: mealToUpdate.kcal,
        protein: mealToUpdate.prot,
        carbs: mealToUpdate.carb,
        fats: mealToUpdate.fat
      },
      new_meal: {
        description: new_description || mealToUpdate.meal_description,
        calories: new_calories || mealToUpdate.kcal,
        protein: new_protein || mealToUpdate.prot,
        carbs: new_carbs || mealToUpdate.carb,
        fats: new_fats || mealToUpdate.fat
      },
      daily_progress: {
        calories_used: Math.round(row.kcal_used),
        calories_goal: row.kcal_goal,
        protein_used: Math.round(row.prot_used),
        protein_goal: row.prot_goal,
        carbs_used: Math.round(row.carb_used),
        carbs_goal: row.carb_goal,
        fats_used: Math.round(row.fat_used),
        fats_goal: row.fat_goal
      },
      formatted_progress: formattedBars,
      response_instructions: `Format your response using this exact structure:

✅ *Meal updated successfully!*

🍽️ *<MealType>:* <updated meal description>

🔥 *Calories:* <kcal> kcal
🥩 *Proteins:* <g> g
🥔 *Carbs:* <g> g
🧈 *Fats:* <g> g

📝 *Assumptions:* We've updated this to <explain what changed>. Let me know if anything else needs adjusting! 🙂

⏳ *Daily Progress:*
${formattedBars}

<motivational sentence about the update + ask how their day is going + relevant emoji>`
    };
  } catch (error) {
    console.error('❌ Update meal error:', error);
    return { success: false, error: error.message };
  } finally {
    // Always cleanup temp key, even on error
    if (tempKey && redisClient) {
      try {
        await redisClient.del(tempKey);
        console.log('🧹 Cleaned up temp key:', tempKey);
      } catch (cleanupError) {
        console.error('⚠️ Failed to cleanup temp key:', cleanupError);
      }
    }
  }
};

// ============================================================================
// DELETE MEAL TOOL
// ============================================================================

const deleteMealTool = async (args, context) => {
  const { phone, db, today, redisClient } = context;
  const { meal_identifier } = args;

  let tempKey = null;

  try {
    console.log('🗑️ Deleting meal:', { meal_identifier });

    // Create temp key for tracking
    tempKey = `temp:meals:${phone}:${Date.now()}`;

    // Get recent meals to find which one to delete
    const { data: recentMeals, error: fetchError } = await db
      .from('meal_logs')
      .select('*')
      .eq('user_phone', phone)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch recent meals: ${fetchError.message}`);
    }

    if (!recentMeals || recentMeals.length === 0) {
      return {
        success: false,
        error: 'No meals found today to delete.'
      };
    }

    // Cache meal data in Redis for context
    if (redisClient) {
      await redisClient.setEx(tempKey, 300, JSON.stringify(recentMeals));
    }

    // Find the meal to delete based on identifier
    let mealToDelete = recentMeals[0]; // Default to most recent

    if (meal_identifier && meal_identifier.toLowerCase() !== 'most recent') {
      const identifier = meal_identifier.toLowerCase();
      const found = recentMeals.find(m =>
        m.meal_description.toLowerCase().includes(identifier) ||
        identifier.includes(m.meal_description.toLowerCase().split(' ')[0])
      );
      if (found) {
        mealToDelete = found;
      }
    }

    // Delete the meal
    const { error: deleteError } = await db
      .from('meal_logs')
      .delete()
      .eq('id', mealToDelete.id);

    if (deleteError) {
      throw new Error(`Failed to delete meal: ${deleteError.message}`);
    }

    // Update daily totals (subtract)
    const rpcError = await db.rpc('increment_daily_totals', {
      p_phone: phone,
      p_date: today,
      p_kcal: -mealToDelete.kcal,
      p_prot: -mealToDelete.prot,
      p_carb: -mealToDelete.carb,
      p_fat: -mealToDelete.fat
    });

    if (rpcError.error) {
      throw new Error(`Failed to update daily totals: ${rpcError.error.message}`);
    }

    // Get updated progress
    const { data: userData, error: fetchNewError } = await db.rpc('get_user_data', {
      p_phone: phone,
      p_date: today
    });

    if (fetchNewError) {
      throw new Error(`Failed to fetch updated data: ${fetchNewError.message}`);
    }

    const row = userData?.[0];
    if (!row) {
      throw new Error('User data not found after meal deletion');
    }

    console.log('✅ Meal deleted successfully');

    // Format progress bars for response
    const formattedBars = formatProgressBars(
      { kcal: row.kcal_used, prot: row.prot_used, carb: row.carb_used, fat: row.fat_used },
      { kcal: row.kcal_goal, prot: row.prot_goal, carb: row.carb_goal, fat: row.fat_goal }
    );

    return {
      success: true,
      message: 'Meal deleted successfully!',
      deleted_meal: {
        description: mealToDelete.meal_description,
        calories: mealToDelete.kcal,
        protein: mealToDelete.prot,
        carbs: mealToDelete.carb,
        fats: mealToDelete.fat
      },
      daily_progress: {
        calories_used: Math.round(row.kcal_used),
        calories_goal: row.kcal_goal,
        protein_used: Math.round(row.prot_used),
        protein_goal: row.prot_goal,
        carbs_used: Math.round(row.carb_used),
        carbs_goal: row.carb_goal,
        fats_used: Math.round(row.fat_used),
        fats_goal: row.fat_goal
      },
      formatted_progress: formattedBars,
      response_instructions: `Format your response using this exact structure:

✅ *Meal "${mealToDelete.meal_description}" removed from today's log.*

⏳ *Daily Progress:*
${formattedBars}

<brief supportive message asking if they need anything else + relevant emoji>`
    };
  } catch (error) {
    console.error('❌ Delete meal error:', error);
    return { success: false, error: error.message };
  } finally {
    // Always cleanup temp key, even on error
    if (tempKey && redisClient) {
      try {
        await redisClient.del(tempKey);
        console.log('🧹 Cleaned up temp key:', tempKey);
      } catch (cleanupError) {
        console.error('⚠️ Failed to cleanup temp key:', cleanupError);
      }
    }
  }
};

// ============================================================================
// SHOW PROGRESS TOOL
// ============================================================================

const showProgressTool = async (context) => {
  const { phone, db, today } = context;

  try {
    console.log('📊 Fetching daily progress');

    const { data, error } = await db.rpc('get_user_data', {
      p_phone: phone,
      p_date: today
    });

    if (error) {
      throw new Error(`Failed to fetch progress: ${error.message}`);
    }

    const row = data?.[0];
    if (!row) {
      throw new Error('User data not found');
    }

    // Calculate percentages and traffic light indicators
    const getIndicator = (used, goal) => {
      if (goal === 0) return '⚪';
      const percent = (used / goal) * 100;
      if (percent <= 95) return '🟢'; // Under goal
      if (percent <= 110) return '🟡'; // Near goal
      return '🔴'; // Over goal
    };

    const progressData = {
      success: true,
      daily_progress: {
        calories: {
          indicator: getIndicator(row.kcal_used, row.kcal_goal),
          used: Math.round(row.kcal_used),
          goal: row.kcal_goal,
          remaining: Math.max(0, row.kcal_goal - row.kcal_used)
        },
        protein: {
          indicator: getIndicator(row.prot_used, row.prot_goal),
          used: Math.round(row.prot_used),
          goal: row.prot_goal,
          remaining: Math.max(0, row.prot_goal - row.prot_used)
        },
        carbs: {
          indicator: getIndicator(row.carb_used, row.carb_goal),
          used: Math.round(row.carb_used),
          goal: row.carb_goal,
          remaining: Math.max(0, row.carb_goal - row.carb_used)
        },
        fats: {
          indicator: getIndicator(row.fat_used, row.fat_goal),
          used: Math.round(row.fat_used),
          goal: row.fat_goal,
          remaining: Math.max(0, row.fat_goal - row.fat_used)
        }
      }
    };

    console.log('✅ Progress fetched successfully');
    return progressData;
  } catch (error) {
    console.error('❌ Show progress error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// GET MEAL HISTORY TOOL
// ============================================================================

const getMealHistoryTool = async (context) => {
  const { phone, db, today } = context;

  try {
    console.log('📋 Fetching meal history');

    const { data: meals, error } = await db
      .from('meal_logs')
      .select('*')
      .eq('user_phone', phone)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch meal history: ${error.message}`);
    }

    if (!meals || meals.length === 0) {
      return {
        success: true,
        meals: [],
        message: 'No meals logged today yet.'
      };
    }

    const formattedMeals = meals.map((meal, index) => ({
      number: index + 1,
      description: meal.meal_description,
      calories: meal.kcal,
      protein: meal.prot,
      carbs: meal.carb,
      fats: meal.fat,
      time: new Date(meal.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }));

    console.log('✅ Meal history fetched successfully');

    return {
      success: true,
      meals: formattedMeals,
      total_meals: meals.length
    };
  } catch (error) {
    console.error('❌ Get meal history error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// GET DASHBOARD LINK TOOL
// ============================================================================

const getDashboardLinkTool = async (context) => {
  const { phone } = context;

  try {
    console.log('🔗 Generating dashboard link');

    // This will be called from the main webhook handler
    // Return a marker that tells the webhook to generate the link
    return {
      success: true,
      action: 'generate_dashboard_link',
      phone: phone
    };
  } catch (error) {
    console.error('❌ Get dashboard link error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { executeTool };
