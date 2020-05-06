import PropTypes from 'prop-types';
import React, {useContext} from 'react';
import {AppBar as MaterialAppBar, Paper, Toolbar, Typography} from '@material-ui/core';
import {Link as RouterLink} from 'react-router-dom';
import {Redirect, withRouter} from 'react-router-dom';
import {fade, makeStyles, useTheme} from '@material-ui/core/styles';

import {AdvancedGraph} from '../components/graphs/AdvancedGraph';
import {BasicDataComponent} from '../models/BasicDataComponent';
import {DivisionTable} from '../components/tables/DivisionTable';
import {DivisionTypesComponent} from '../models/DivisionTypesComponent';
import {DonateLink} from '../components/chrome/DonateLink';
import {Footer} from '../Footer';
import {NameComponent} from '../models/NameComponent';
import {Path} from '../models/Path';
import {SocialMediaButtons} from '../components/chrome/SocialMediaButtons';
import {WorldContext} from '../WorldContext';

const shortNumber = require('short-number');

const HORIZONTAL_MARGIN = '16px';

const useStyles = makeStyles(theme => ({
  body: {
    background: '#fafafa',
    overflow: 'auto',
  },
  content: {
    padding: HORIZONTAL_MARGIN,
    margin: HORIZONTAL_MARGIN,
  },
  section: {
    margin: '16px 0 24px 0',
    overflow: 'scroll',
  },
  graph: {
    border: '1px solid',
    borderColor: theme.palette.divider,
    borderRadius: '4px',
    padding: '8px',
  },
}));

export const PageRegion = withRouter((props) => {
  const classes = useStyles();
  const world = useContext(WorldContext);
  const path = Path.parse('/' + props.match.params[0]);

  if (path.matches('/US')) {
    return <Redirect to="/US" />;
  }

  const basic = world.get(path, BasicDataComponent);
  const divisions = world.get(path, DivisionTypesComponent);

  return (
    <div className={classes.body}>
      <AppBar />
        <Paper className={classes.content}>
          <Title className={classes.section} path={path} />

          <DailyGraph
              basic={basic}
              className={`${classes.section} ${classes.graph}`}
          />

          <DoublingGraph
              basic={basic}
              className={`${classes.section} ${classes.graph}`}
          />

          {divisions &&
            divisions.types().map(({id, plural}) =>
              <DivisionTable
                  key={id}
                  id={id}
                  plural={plural}
                  parent={path}
                  className={classes.section}
              />
            )}
        </Paper>
        <Footer />
    </div>
  );
});

const RELIEF_COLOR = '#fff';

const useAppBarStyles = makeStyles(theme => ({
  appBar: {
    color: RELIEF_COLOR,
    display: 'flex',
  },
  appName: {
    overflow: 'visible',
  },
  donations: {
    background: RELIEF_COLOR,
    borderRadius: '8px',
    display: 'block',
    marginLeft: '16px',
    padding: '6px 8px',
    textAlign: 'center',

    '&:hover': {
      filter: `drop-shadow(0 0 2px ${fade(RELIEF_COLOR, 0.95)})`,
      textDecoration: 'none',
    },
  },
  expander: {
    flexGrow: 1,
  },
  socialButtons: {
    fontSize: '1.5625em',
    lineHeight: '1em',
    '& > *': {
      marginLeft: '4px',
      verticalAlign: 'middle',
    }
  },
  wrap: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',

    [theme.breakpoints.down('xs')]: {
      display: 'initial',
      '& > *': {
        margin: '4px',
      },
    },
  },
}));

const AppBar = (props) => {
  const classes = useAppBarStyles();
  const theme = useTheme();

  return (
    <MaterialAppBar position="static">
      <Toolbar className={classes.appBar}>
        <Typography noWrap className={classes.appName} variant="h6">
          COVID-19.direct
        </Typography>
        <div className={classes.expander} />

        <div className={classes.wrap}>
          <SocialMediaButtons
              backgroundColor="#fff"
              className={classes.socialButtons}
              iconColor={theme.palette.secondary.main}
          />

          <DonateLink className={classes.donations} message="Buy us a coffee!" />
        </div>
      </Toolbar>
    </MaterialAppBar>
  );
};

const useTitleStyles = makeStyles(theme => ({
  noOverflow: {
    overflow: 'hidden',
  },
  container: {
    alignItems: 'flex-end',
    display: 'flex',
    flexWrap: 'wrap',
    margin: '0 -12px',
  },
  node: {
    display: 'flex',
    margin: '0 12px 16px 12px',

    [theme.breakpoints.down('sm')]: {
      '&:not(.squish)': {
        flex: '0 0 100%',
      },
    },
  },
  text: {
    padding: '0 8px',
    marginLeft: '-8px',
    marginRight: '8px',
  },
  parentLink: {
    borderRadius: '8px',
    color: fade(theme.palette.text.primary, 0.5),
    textDecoration: 'none',
    '&:hover': {
      background: '#efefef',
    },
  },
  numbers: {
    color: theme.palette.text.secondary,
    display: 'flex',
  },
  number: {
    borderTop: '2px solid',
    flexGrow: 1,
    paddingTop: '4px',
    '&:not(:first-child)': {
      paddingLeft: '4px',
    },
    '&:not(:last-child)': {
      paddingRight: '4px',
    },
  },
}));

const Title = (props) => {
  const classes = useTitleStyles();

  const world = useContext(WorldContext);
  const name = world.get(props.path, NameComponent);
  if (!name) {
    return <></>;
  }

  const names = [{
    path: props.path,
    text: <span className={classes.text}>{name.english()}</span>,
  }];

  let parentCursor = props.path.parent();
  while (parentCursor) {
    const parentName = world.get(parentCursor, NameComponent);
    if (parentName) {
      names.push({
        path: parentCursor,
        text:
            <RouterLink
                className={`${classes.text} ${classes.parentLink}`}
                to={'/country' + parentCursor.string()}>
              {parentName.english()}
            </RouterLink>,
        squish: true,
      });
    }

    parentCursor = parentCursor.parent();
  }

  for (const name of names) {
    const basic = world.get(name.path, BasicDataComponent);
    name.numbers = [
      {
        plural: 'cases',
        color: '#00aeef',
        value: basic.confirmed().lastValue(),
        change: basic.confirmed().change().lastValue(),
      },
      {
        plural: 'deaths',
        color: 'red',
        value: basic.died().lastValue(),
        change: basic.died().change().lastValue(),
      },
    ];
  }

  return (
    // noOverflow because we're using negative margins
    <div className={`${props.className} ${props.noOverflow}`}>
      <div className={classes.container}>
        {names.map(({path, text, numbers, squish}, i) =>
          <div
              key={path.string()}
              className={`${classes.node} ${squish ? 'squish': ''}`}>
            <div>
              <Typography variant={squish ? 'subtitle1' : 'h4'}>
                {text}
              </Typography>
              <div className={classes.numbers}>
                {numbers.map(({plural, color, value, change}) =>
                  <div
                      key={plural}
                      className={classes.number}
                      style={{borderColor: color}}>
                    {shortNumber(value)}
                    {` ${i === 0 ? plural : ''} `}
                    (+{shortNumber(change)})
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Title.propTypes = {
  className: PropTypes.string,
  path: PropTypes.instanceOf(Path).isRequired,
};

const DailyGraph = (props) => {
  const basic = props.basic;

  return (
    <AdvancedGraph
      className={props.className}
      serieses={[{
          series: basic.confirmed().change(),
          color: 'teal',
          trend: 'orange',
        }, {
          series: basic.confirmed(),
          color: 'gray',
          initial: 'off',
        }, {
          series: basic.active(),
          color: 'pink',
          initial: 'off',
        }, {
          series: basic.recovered(),
          color: 'green',
          initial: 'off',
        }, {
          series: basic.died().change(),
          color: 'purple',
        }, {
          series: basic.died(),
          color: 'red',
          initial: 'off',
        },
      ]}
    />
  );
};

const DoublingGraph = (props) => {
  const basic = props.basic;

  return (
    <AdvancedGraph
      className={props.className}
      serieses={[{
          series: basic.confirmed().doublingInterval(),
          color: 'teal',
          trend: 'orange',
        }, {
          series: basic.died().doublingInterval(),
          color: 'red',
        },
      ]}
    />
  );
};
