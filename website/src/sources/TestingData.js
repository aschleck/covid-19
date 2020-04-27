import { Country, State } from './UnitedStates';
import { DailySeries } from './DailySeries';

const superagent = require("superagent");

export class TestingData {

  constructor() {
    this.countryData_ = undefined;
    this.statesData_ = undefined;
  }

  getFor(region) {
    if (region instanceof Country) {
      return this.getForCountry_(region);
    } else if (region instanceof State) {
      return this.getForState_(region);
    } else {
      return undefined;
    }
  }

  async getForCountry_(region) {
    if (!this.countryData_) {
      this.countryData_ =
          superagent.get("/data/us_testing.json").then(res => res.body);
    }

    return TestingData.splitToSeries_(this.countryData_);
  }

  async getForState_(region) {
    if (!this.stateData_) {
      this.stateData_ =
          superagent.get("/data/state_testing.json").then(res => res.body);
    }

    return TestingData.splitToSeries_(
        this.stateData_.filter(d => d.state === region.twoLetterName));
  }

  static splitToSeries_(data) {
    const 
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
      const m = moment(String(d.date), "YYYY-MM-DD");
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
}

var cachedStates;
var cachedUS;

const testingStatesURL = "/data/state_testing.json";
const testingUSURL = "";

async function fetchTestingDataStates() {
    if (cachedStates) {
        return cachedStates;
    }
    cachedStates = superagent
        .get(testingStatesURL)
        .then(res => {
            return res.body;
        });
    return cachedStates;
}

async function fetchTestingDataUS() {
    if (cachedUS) {
        return cachedUS;
    }
    cachedUS = superagent
        .get(testingUSURL)
        .then(res => {
            return res.body;
        });
    return cachedUS;
}

export { fetchTestingDataStates, fetchTestingDataUS }
