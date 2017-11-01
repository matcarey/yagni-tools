const Promise = require('bluebird');
const assert = require('assert');
const R = require('ramda');

const debugOut = out => console.log(JSON.stringify(out, null, 2));

assert(process.env.MEETUP_KEY, 'MEETUP_KEY variable isn\'t set on enviroment');

const meetup = Promise.promisifyAll(require('meetup-api')({
  key: process.env.MEETUP_KEY
}), {suffix: 'Promise'});

const locationGeneralisations = {
  "Wareham": "West",
  "Southsea": "Portsmouth",
  "Basingstoke": "North",
  "Winchester": "North",
  "Emsworth": "Portsmouth",
  "Totton": "Southampton",
  "Dibden": "Southampton",
  "Park Gate": "Fareham",
  "Bournemouth": "West",
  "Hamble": "Fareham",
  "Bognor Regis": "East",
  "Waterlooville": "Portsmouth",
  "New York": "N/A",
  "Greater London": "North",
  "North Baddesley": "Southampton",
  "Widley": "Portsmouth",
  "Chichester": "East",
  "Chilworth": "Southampton",
  "Port Solent": "Portsmouth",
  "Liphook": "North",
  "Ryde": "Isle of White",
  "Lee-on-the-Solent": "Fareham",
  "Marchwood": "Southampton",
  "Western Docks": "Southampton",
  "Colden Common": "North",
  "Locks Heath": "Fareham",
  "Havant": "Portsmouth",
  "Southampton International Airpor": "Southampton",
  "Stubbington": "Fareham"
};

const group_id = '26281768';
const urlname = 'Solent-Tech';
const event_id = 244251903;
const reduceMembersToWeightsBy = R.reduceBy((acc, member) => acc + member.weighting, 0);
const broadenLocation = location => (locationGeneralisations[location] || location)
const calculateArea = i => broadenLocation(i.city || i.hometown || 'Solent');

const members = meetup.getMembersPromise({group_id})
  .then(response => response.results)
  .then(R.map(R.pick(['name', 'city', 'hometown', 'bio', 'link', 'joined', 'id'])))

const rsvps = meetup.getRSVPsPromise({event_id, urlname})
  .then(response => response.results)
  .then(R.map(item => R.merge(item, {id: item.member.member_id})));

function runScenario(title, weighting) {
  return Promise.all([members, rsvps])
    .spread((members, rsvps) => R.map(member => {
      let out = R.clone(member);
      const rsvp = R.find(R.propEq('id', member.id))(rsvps);
      out.weighting = weighting.DEFAULT;
      if (rsvp) {
        out.guests = rsvp.guests;
        out.rsvpTime = rsvp.created;
        out.attending = rsvp.response === 'yes';
        out.weighting += out.attending ? weighting.ATTENDING + rsvp.guests * weighting.PER_GUEST : weighting.NOT_ATTENDING;
      }
      return out;
    })(members))
    .then(reduceMembersToWeightsBy(calculateArea))
    .then(outcome => {
      const tmp = [];
      const out = {};
      Object.keys(outcome).forEach(key => {
        const tmpKey = outcome[key];
        tmp[tmpKey] = tmp[tmpKey] || [];
        tmp[tmpKey].push(key);
      });
      R.reverse(R.reject(R.isNil)(R.flatten(tmp))).forEach(key => {
        out[key] = outcome[key];
      });
      return out;
    })
    .then(outcome => ({title, outcome}));
}

Promise.all([
  runScenario('Members', {
    DEFAULT: 1,
    ATTENDING: 0,
    PER_GUEST: 0,
    NOT_ATTENDING: 0
  }),
  runScenario('First Meetup', {
    DEFAULT: 0,
    ATTENDING: 1,
    PER_GUEST: 1,
    NOT_ATTENDING: 0
  }),
  runScenario('Weighted', {
    DEFAULT: 2,
    ATTENDING: 5,
    PER_GUEST: 2,
    NOT_ATTENDING: -1
  })
])
  .then(debugOut)
  .catch(err =>
    console.error('Found meetup error', err)
  );
