const moment = require('moment');
const {linearRegression} = require('simple-statistics');

const periods = {
  daily: {
    doublingLabel: 'Days to Double',
    smoothLabel: 'day',
    formatter: (moment) => moment.format('MM/DD'),
    intervalS: 24 * 60 * 60,
    converter: (data) =>
        data
            .map(([timestamp, value]) => [moment.unix(timestamp), value])
            .sort(([a,], [b,]) => a.diff(b)),
    pointConverter: ([timestamp, value]) => [moment.unix(timestamp), value],
  },
};

const REGRESSION_WINDOW_SIZE = 7;
const SMOOTH_WINDOW_SIZE = 3;

/**
 * A data series is a label with a collection of values at specific moments.
 */
export class DataSeries {

  static fromFormattedDates(label, raw) {
    if (raw.length > 0) {
      return new DataSeries(label, raw, periods.daily);
    } else {
      return new EmptySeries(label, periods.daily);
    }
  }

  static flatten(serieses) {
    const points = new Map();
    const formatters = new Set();

    for (const series of serieses) {
      formatters.add(series.formatter());

      if (!series.points()) {
        continue;
      }

      for (const [moment, value] of series.points()) {
        const key = moment.unix();
        if (!points.has(key)) {
          points.set(key, {});
        }

        points.get(key)[series.label()] = value;
      }
    }

    if (formatters.size > 1) {
      throw new Error('Multiple formatters are not allowed');
    } else if (formatters.size === 0) {
      throw new Error('No formatter found');
    }
    const formatter = formatters.values().next().value;

    return {
      data:
          [...points.entries()]
              .sort(([a,], [b,]) => a - b)
              .map(([timestamp, data]) => ({
                timestamp,
                ...data,
              })),
      timestampFormatter: (timestamp) => formatter(moment.unix(timestamp)),
    };
  }

  constructor(label, raw, period) {
		this.label_ = label;
    this.raw_ = raw;
    this.period_ = period;
    this.points_ = undefined;
    this.lastPoint_ = undefined;
  }

  label() {
    return this.label_;
  }

  formatter() {
    return this.period_.formatter;
  }

  points() {
    if (!this.points_ && this.raw_.length > 0) {
      this.points_ = this.period_.converter(this.raw_);
    }
    return this.points_;
  }

  lastPoint() {
    if (!this.lastPoint_ && this.raw_.length > 0) {
      this.lastPoint_ =
          this.period_.pointConverter(this.raw_[this.raw_.length - 1]);
    }
    return this.lastPoint_;
  }

  lastValue() {
    if (this.lastPoint()) {
      return this.lastPoint()[1];
    } else {
      return undefined;
    }
  }

  change() {
    const name = `New ${this.label_}`;

    const entries = this.points_ || this.raw_;
    if (entries.length < 1) {
      return new EmptySeries(name, this.period_);
    }

    // We often only want to know the change between the last two values, so
    // pregenerate those.
    // Every series has an implicit first value of 0, because places only show
    // up in the data when they have a case. So account for it.
    const secondToLastValue =
        entries.length >= 2 ? entries[entries.length - 2][1] : 0;
    if (typeof entries[0][0] === 'number') {
      this.lastPoint_ = this.period_.pointConverter(entries[entries.length - 1]);
    } else {
      this.lastPoint_ = entries[entries.length - 1];
    }
    const lastChange = this.lastPoint_[1] - secondToLastValue;

    const generator = () => {
      const points = this.points();
      const deltaPoints = [];
      deltaPoints.push([points[0][0], points[0][1]]);
      for (let i = 1; i < points.length; ++i) {
        deltaPoints.push([
          points[i][0],
          Math.max(0, points[i][1] - points[i - 1][1]),
        ]);
      }
      return deltaPoints;
    };

    return new LazyDataSeries(
        name,
        generator,
        [this.lastPoint_[0], lastChange],
        this.period_);
  }

  doublingInterval() {
    const name = `${this.label_} ${this.period_.doublingLabel}`;

    const entries = this.points_ || this.raw_;
    if (entries.length < REGRESSION_WINDOW_SIZE) {
      return new EmptySeries(name, this.period_);
    }

    const lastWindow = entries.slice(entries.length - REGRESSION_WINDOW_SIZE);
    const lastLogs =
        lastWindow
            .map(([timestamp, v]) => [timestamp, Math.log2(v)]);
    const {m} = linearRegression(lastLogs);
    const value = 1 / (m * this.period_.intervalS);
    const lastDoubleValue = !isNaN(value) && 0 < value && value <= 100 ? value : NaN;
    const lastDouble = [this.lastPoint()[0], lastDoubleValue];

    const generator = () => {
      const points = this.points();
      const log = points.map(([m, v]) => [m.unix(), Math.log2(v)]);
      const doublings = [];
      for (let i = REGRESSION_WINDOW_SIZE; i < points.length - 1; ++i) {
        const window = log.slice(i - REGRESSION_WINDOW_SIZE, i + 1);
        const {m} = linearRegression(window);
        const value = 1 / (m * this.period_.intervalS);
        doublings.push([
          points[i][0],
          !isNaN(value) && 0 < value && value <= 100 ? value : NaN,
        ]);
      }

      doublings.push(lastDouble);
      return doublings;
    };

    return new LazyDataSeries(name, generator, lastDouble, this.period_);
  }

  smooth() {
    const name = `${this.label_} (${SMOOTH_WINDOW_SIZE} ${this.period_.smoothLabel} avg)`;

    const points = this.points();
    if (points.length < SMOOTH_WINDOW_SIZE) {
      return new EmptySeries(name, this.period_);
    }

    const smoothed = [];
    for (let i = SMOOTH_WINDOW_SIZE - 1; i < points.length; ++i) {
      const window = points.slice(i - SMOOTH_WINDOW_SIZE + 1, i + 1)
      const sum = window.reduce((sum, [, v]) => Math.max(v, 0) + sum, 0);
      smoothed.push([
        points[i][0],
        sum / SMOOTH_WINDOW_SIZE,
      ]);
    }

    const series = new DataSeries(name, undefined, this.period_);
    series.points_ = smoothed;
    return series;
  }

  sum() {
    let sum = 0;
    for (const [, value] of this.points()) {
      sum += value;
    }
    return sum;
  }

  trend() {
    const points = this.points();
    if (points.length < 8) {
      return undefined;
    }

    const linear = trendFit(this.label_, points, this.period_, (v) => v, (p) => p);
    const log =
        trendFit(
            this.label_,
            points,
            this.period_,
            (v) => Math.log2(v),
            (p) => Math.exp(p * Math.log(2)));

    if (linear.error < log.error) {
      return linear.series;
    } else {
      return log.series;
    }
  }

  today() {
    const last = this.lastPoint();
    if (!last) {
      return undefined;
    }

    return moment().isSame(last[0], 'day') ? last[1] : undefined;
  }
}

class EmptySeries extends DataSeries {

  constructor(label, period) {
    super(label, [], period);
  }
}

class LazyDataSeries extends DataSeries {

  constructor(label, generator, lastPoint, period) {
    super(label, undefined, period);
    this.generator_ = generator;
    this.lastPoint_ = lastPoint;
  }

  points() {
    if (!this.points_) {
      this.points_ = this.generator_();
    }
    return this.points_;
  }
}

function positiveOrNothing(value) {
  return value >= 0 ? value : NaN;
}

function trendFit(label, points, period, valueMapper, predictionMapper) {
  const {m, b} =
      linearRegression(
          points.slice(-1 - REGRESSION_WINDOW_SIZE, -1)
              .map(([moment, v]) => [moment.unix(), valueMapper(v)]));
  if (isNaN(m) || isNaN(b)) {
    return {series: undefined, error: 9999999999};
  }

  const trend =
      new DataSeries(`${label} (Trend)`, undefined, period);
  trend.points_ =
      points.map(([moment, ]) =>
          [moment, predictionMapper(positiveOrNothing(m * moment.unix() + b))]);

  let error = 0;
  for (let i = 0; i < points.length; ++i) {
    const difference = points[i][1] - (trend.points_[i][1] || 0);
    error += difference * difference;
  }

  return {series: trend, error};
}
