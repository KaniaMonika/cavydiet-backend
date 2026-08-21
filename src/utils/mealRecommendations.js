const {
  calculateMealSummary,
} = require('./mealSummary');

function isInRange(value, min, max) {
  return value >= min && value <= max;
}

function isRatioInRange(ratio) {
  return ratio >= 1.3 && ratio <= 1.6;
}

function calculateDistanceFromRange(value, min, max) {
  if (value < min) {
    return (min - value) / min;
  }

  if (value > max) {
    return (value - max) / max;
  }

  return 0;
}

function evaluateMealMix({
  currentFoods,
  suggestedFoods,
  totalWeightG,
}) {
  const combinedFoods = [
    ...currentFoods,
    ...suggestedFoods,
  ];

  const summary = calculateMealSummary(
    combinedFoods,
    totalWeightG
  );

  const vitaminCInRange = isInRange(
    summary.vitaminC,
    summary.vitaminCGoalMin,
    summary.vitaminCGoalMax
  );

  const calciumInRange = isInRange(
    summary.calcium,
    summary.calciumGoalMin,
    summary.calciumGoalMax
  );

  const ratioInRange = isRatioInRange(
    summary.calciumPhosphorusRatio
  );

  const vitaminCPenalty = calculateDistanceFromRange(
  summary.vitaminC,
  summary.vitaminCGoalMin,
  summary.vitaminCGoalMax
);

const calciumPenalty = calculateDistanceFromRange(
  summary.calcium,
  summary.calciumGoalMin,
  summary.calciumGoalMax
);

const ratioPenalty = calculateDistanceFromRange(
  summary.calciumPhosphorusRatio,
  1.3,
  1.6
);

const highOxalatesPenalty =
  summary.hasHighOxalates ? 5 : 0;

const score = Number(
  (
    vitaminCPenalty +
    calciumPenalty +
    ratioPenalty +
    highOxalatesPenalty
  ).toFixed(4)
);

  const allGoalsInRange =
    vitaminCInRange &&
    calciumInRange &&
    ratioInRange &&
    !summary.hasHighOxalates;

  return {
    summary,
    goals: {
      vitaminCInRange,
      calciumInRange,
      ratioInRange,
      noHighOxalates: !summary.hasHighOxalates,
    },
    allGoalsInRange,
    score,
  };
}

function findTopMealMixes({
  currentFoods,
  candidateMixes,
  totalWeightG,
  limit = 3,
}) {
  if (!Array.isArray(candidateMixes) || candidateMixes.length === 0) {
    return null;
  }

  const evaluatedMixes = candidateMixes.map((suggestedFoods) => {
    const evaluation = evaluateMealMix({
      currentFoods,
      suggestedFoods,
      totalWeightG,
    });

    return {
      suggestedFoods,
      ...evaluation,
    };
  });

  evaluatedMixes.sort((a, b) => {
  if (a.score !== b.score) {
    return a.score - b.score;
  }

  if (
    a.summary.hasHighOxalates !==
    b.summary.hasHighOxalates
  ) {
    return a.summary.hasHighOxalates ? 1 : -1;
  }

  return a.summary.sugar - b.summary.sugar;
});

  return evaluatedMixes.slice(0, limit);
}

function generateFoodPairs(
  foods,
  amounts = [25, 50, 75, 100]
) {
  const pairs = [];

  for (let i = 0; i < foods.length; i++) {
    for (let j = i + 1; j < foods.length; j++) {
      for (const firstAmount of amounts) {
        for (const secondAmount of amounts) {
          pairs.push([
            {
              ...foods[i],
              amount_g: firstAmount,
            },
            {
              ...foods[j],
              amount_g: secondAmount,
            },
          ]);
        }
      }
    }
  }

  return pairs;
}

function recommendBestFoodPair({
  currentFoods,
  availableFoods,
  totalWeightG,
}) {
  if (!Array.isArray(availableFoods) || availableFoods.length < 2) {
    return null;
  }

  const safeFoods = availableFoods.filter(
    (food) => !food.high_oxalates
  );

  if (safeFoods.length < 2) {
    return null;
  }

  const candidateMixes = generateFoodPairs(safeFoods);

  return findTopMealMixes({
    currentFoods,
    candidateMixes,
    totalWeightG,
    limit: 3,
    });
}

module.exports = {
  evaluateMealMix,
  findTopMealMixes,
  generateFoodPairs,
  recommendBestFoodPair,
};