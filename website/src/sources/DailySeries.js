export class DailySeries {
  constructor(valuesByMoments) {
    this.valuesByMoments_ = valuesByMoments.sort((a, b) => a.isBefore(b));
  }
}
