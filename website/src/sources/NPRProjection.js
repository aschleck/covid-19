import { Country, State } from './UnitedStates';
import { DailySeries } from './DailySeries';

const moment = require("moment");
const superagent = require("superagent");

export class Projections {

  constructor() {
    this.data_ = undefined;
  }

  async getFor(region) {
    if (!this.data) {
      this.data_ =
          superagent.get("/data/npr_projection.json").then(res => res.body);
    }

    // I feel bad about type checking here, but we have no way to differentiate
    // eg Washington County, OR from WA otherwise...
    let name;
    if (region instanceof Country) {
      if (region.name === "United States") {
        name = "United States of America";
      } else {
        name = region.name;
      }
    } else if (region instanceof State) {
      name = region.name;
    } else {
      return undefined;
    }

    return Projections.splitToSeries_(
        this.data_.filter(d => d.location_name === name));
  }

  static splitToSeries_(data) {
    const beds = {
      low: [],
      mean: [],
      high: [],
    };
    const deaths = {
      low: [],
      mean: [],
      high: [],
    };
    data.forEach(d => {
      const m = moment(d.date, "YYYY-MM-DD");
      for (const [source, destination] of [
          ['allbed_lower', beds.low],
          ['allbed_mean', beds.mean],
          ['allbed_upper', beds.upper],
          ['deaths_lower', deaths.low],
          ['deaths_mean', deaths.mean],
          ['deaths_upper', deaths.high],
      ]) {
        destination.push({
          moment: m,
          value: d[source],
        });
      }
    });

    return {
      'beds_low': new DailySeries(beds.low),
      'beds_mean': new DailySeries(beds.mean),
      'beds_high': new DailySeries(beds.high),
      'deaths_low': new DailySeries(deaths.low),
      'deaths_mean': new DailySeries(deaths.mean),
      'deaths_high': new DailySeries(deaths.high),
    };
  }
}
