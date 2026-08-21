function calculateMealSummary(foods, totalWeightG) {
  const totalWeightKg = totalWeightG / 1000;

  const vitaminCGoalMin = totalWeightKg * 20;
  const vitaminCGoalMax = totalWeightKg * 50;

  const calciumGoalMin = totalWeightKg * 20;
  const calciumGoalMax = totalWeightKg * 50;

  let vitaminC = 0;
  let calcium = 0;
  let phosphorus = 0;
  let sugar = 0;
  let hasHighOxalates = false;

  foods.forEach((food) => {
    const multiplier = Number(food.amount_g) / 100;

    vitaminC += Number(food.vitc) * multiplier;
    calcium += Number(food.calcium) * multiplier;
    phosphorus += Number(food.phosphorus) * multiplier;
    sugar += Number(food.sugar ?? 0) * multiplier;

    if (food.high_oxalates) {
      hasHighOxalates = true;
    }
  });

  const calciumPhosphorusRatio =
    phosphorus === 0 ? 0 : calcium / phosphorus;

  const vitaminCInRange =
  vitaminC >= vitaminCGoalMin &&
  vitaminC <= vitaminCGoalMax;

const calciumInRange =
  calcium >= calciumGoalMin &&
  calcium <= calciumGoalMax;

const ratioInRange =
  calciumPhosphorusRatio >= 1.3 &&
  calciumPhosphorusRatio <= 1.6;

const allGoalsInRange =
  vitaminCInRange &&
  calciumInRange &&
  ratioInRange &&
  !hasHighOxalates;

  return {
    vitaminC: Number(vitaminC.toFixed(2)),
    calcium: Number(calcium.toFixed(2)),
    phosphorus: Number(phosphorus.toFixed(2)),
    calciumPhosphorusRatio: Number(
      calciumPhosphorusRatio.toFixed(2)
    ),
    sugar: Number(sugar.toFixed(2)),
    hasHighOxalates,
    allGoalsInRange,

    totalWeightG,
    totalWeightKg: Number(totalWeightKg.toFixed(2)),
    vitaminCGoalMin: Number(vitaminCGoalMin.toFixed(2)),
    vitaminCGoalMax: Number(vitaminCGoalMax.toFixed(2)),
    calciumGoalMin: Number(calciumGoalMin.toFixed(2)),
    calciumGoalMax: Number(calciumGoalMax.toFixed(2)),
  };
}

module.exports = {
  calculateMealSummary,
};