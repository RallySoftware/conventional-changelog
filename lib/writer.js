var es = require('event-stream');
var util = require('util');
var extend = require('lodash.assign');

var VERSION = '## %s%s';
var PATCH_VERSION = '### %s%s';
var LINK_ISSUE = '[#%s](%s/issues/%s)';
var ISSUE = '(#%s)';
var LINK_COMMIT = '[%s](%s/commit/%s)';
var COMMIT = '(%s)';

module.exports = {
  writeLog: writeLog,
  Writer: Writer
};

function getVersion(version, subtitle) {
  subtitle = subtitle ? ' ' + subtitle : '';
  return util.format(VERSION, version, subtitle);
}
function getPatchVersion(version, subtitle) {
  subtitle = subtitle ? ' ' + subtitle : '';
  return util.format(PATCH_VERSION, version, subtitle);
}
function getIssueLink(repository, issue) {
  return repository ?
    util.format(LINK_ISSUE, issue, repository, issue) :
    util.format(ISSUE, issue);
}
function getCommitLink(repository, hash) {
  var shortHash = hash.substring(0,8); // no need to show super long hash in log
  return repository ?
    util.format(LINK_COMMIT, shortHash, repository, hash) :
    util.format(COMMIT, shortHash);
}

function writeLog(commits, options, done) {

  var log = '';
  var stream = es.through(function(data) {
    log += data;
  }, function() {
    done(null, log);
  });

  var writer = new Writer(stream, options);
  var breaks = {};
  var sections = {};
  for (var subject in options.subjects) {
    if (options.subjects.hasOwnProperty(subject)) {
      sections[subject] = {};
    }
  }

  commits.forEach(function(commit) {
    var section = sections[commit.type];
    var component = commit.component || EMPTY_COMPONENT;

    if (section) {
      section[component] = section[component] || [];
      section[component].push(commit);
    }

    commit.breaks.forEach(function(breakMsg) {
      breaks[EMPTY_COMPONENT] = breaks[EMPTY_COMPONENT] || [];

      breaks[EMPTY_COMPONENT].push({
        subject: breakMsg,
        hash: commit.hash,
        closes: []
      });
    });
  });

  writer.header(options.version);

  for (var section in sections) {
    if (sections.hasOwnProperty(section)) {
      writer.section(options.subjects[section], sections[section]);
    }
  }
  writer.section('Breaking Changes', breaks);
  writer.end();
}

var HEADER_TPL = '<a name="%s"></a>\n%s (%s)\n\n';
var EMPTY_COMPONENT = '$$';

function Writer(stream, options) {
  options = extend({
    versionText: getVersion,
    patchVersionText: getPatchVersion,
    issueLink: getIssueLink.bind(null, options.repository),
    commitLink: getCommitLink.bind(null, options.repository)
  }, options || {});

  this.header = function(version) {
    var subtitle = options.subtitle || '';
    var versionText = version.split('.')[2] === '0' ?
      options.versionText(version, subtitle) :
      options.patchVersionText(version, subtitle);

    stream.write(util.format(HEADER_TPL, version, versionText, currentDate()));
  };

  this.section = function(title, section) {
    var components = Object.getOwnPropertyNames(section).sort();

    if (!components.length) {
      return;
    }

    stream.write(util.format('\n#### %s\n\n', title));

    components.forEach(function(name) {
      var prefix = '*';
      var nested = section[name].length > 1;

      if (name !== EMPTY_COMPONENT) {
        if (nested) {
          stream.write(util.format('* **%s:**\n', name));
          prefix = '  *';
        } else {
          prefix = util.format('* **%s:**', name);
        }
      }

      section[name].forEach(function(commit) {
        stream.write(util.format(
          '%s %s (%s',
          prefix, commit.subject, options.commitLink(commit.hash)
        ));
        if (commit.closes.length) {
          stream.write(', closes ' + commit.closes.map(options.issueLink).join(', '));
        }
        stream.write(')\n');
      });
    });

    stream.write('\n');
  };

  this.end = function() {
    stream.end();
  };
}

function currentDate() {
  var now = new Date();
  var pad = function(i) {
    return ('0' + i).substr(-2);
  };

  return util.format('%d-%s-%s %d:%d:%d', now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), now.getHours(), now.getMinutes(), now.getSeconds());
}
