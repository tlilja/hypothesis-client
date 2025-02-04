/**
 * @typedef {import('../../types/api').Annotation} Annotation
 * @typedef {import('../util/search-filter').Facet} Facet
 */
import * as unicodeUtils from '../util/unicode';
import { quote } from './annotation-metadata';

/**
 * @typedef Filter
 * @prop {(ann: Annotation) => boolean} matches
 */

/**
 * A Matcher specifies how to test whether an annotation matches a query term
 * for a specific field.
 *
 * @template [T=string] - Type of parsed query terms and field values
 * @typedef Matcher
 * @prop {(ann: Annotation) => T[]} fieldValues - Extract the field values to be
 *   matched against a query term
 * @prop {(value: T, term: T) => boolean} matches - Test whether a query term
 *   matches a field value. Both value and term will have been normalized using
 *   `normalize`.
 * @prop {(val: T) => T} normalize - Normalize a parsed term or field value for
 *   comparison
 */

/**
 * Normalize a string query term or field value.
 *
 * @param {string} val
 */
function normalizeStr(val) {
  return unicodeUtils.fold(unicodeUtils.normalize(val)).toLowerCase();
}

/**
 * Filter that matches annotations against a single query term.
 *
 * @template TermType
 * @implements {Filter}
 */
class TermFilter {
  /**
   * @param {TermType} term
   * @param {Matcher<TermType>} matcher
   */
  constructor(term, matcher) {
    this.term = matcher.normalize(term);
    this.matcher = matcher;
  }

  /**
   * Return true if an annotation matches this filter.
   *
   * @param {Annotation} ann
   */
  matches(ann) {
    const matcher = this.matcher;
    return matcher
      .fieldValues(ann)
      .some(value => matcher.matches(matcher.normalize(value), this.term));
  }
}

/**
 * Filter that combines other filters using AND or OR combinators.
 *
 * @implements {Filter}
 */
class BooleanOpFilter {
  /**
   * @param {'and'|'or'} op - Boolean operator
   * @param {Filter[]} filters - Array of filters to test against
   */
  constructor(op, filters) {
    this.operator = op;
    this.filters = filters;
  }

  /**
   * Return true if an annotation matches this filter.
   *
   * @param {Annotation} ann
   */
  matches(ann) {
    if (this.operator === 'and') {
      return this.filters.every(filter => filter.matches(ann));
    } else {
      return this.filters.some(filter => filter.matches(ann));
    }
  }
}

/**
 * Create a matcher that tests whether a query term appears anywhere in a
 * string field value.
 *
 * @param {(ann: Annotation) => string[]} fieldValues
 * @return {Matcher}
 */
function stringFieldMatcher(fieldValues) {
  return {
    fieldValues,
    matches: (value, term) => value.includes(term),
    normalize: normalizeStr,
  };
}

/**
 * Map of field name (from a parsed query) to matcher for that field.
 *
 * @type {Record<string, Matcher|Matcher<number>>}
 */
const fieldMatchers = {
  quote: stringFieldMatcher(ann => [quote(ann) ?? '']),

  /** @type {Matcher<number>} */
  since: {
    fieldValues: ann => [new Date(ann.updated).valueOf()],
    matches: (updatedTime, age) => {
      const delta = (Date.now() - updatedTime) / 1000;
      return delta <= age;
    },
    normalize: timestamp => timestamp,
  },

  tag: stringFieldMatcher(ann => ann.tags),
  text: stringFieldMatcher(ann => [ann.text]),
  uri: stringFieldMatcher(ann => [ann.uri]),
  user: stringFieldMatcher(ann => [
    ann.user,
    ann.user_info?.display_name ?? '',
  ]),
};

/**
 * Filter a set of annotations against a parsed query.
 *
 * @param {Annotation[]} annotations
 * @param {Record<string, Facet>} filters
 * @return {string[]} IDs of matching annotations.
 */
export function filterAnnotations(annotations, filters) {
  /**
   * @template TermType
   * @param {string} field
   * @param {TermType} term
   */
  const makeTermFilter = (field, term) =>
    new TermFilter(
      term,
      // Suppress error about potential mismatch of query term type
      // and what the matcher expects. We assume these match up.
      /** @type {Matcher<any>} */ (fieldMatchers[field])
    );

  // Convert the input filter object into a filter tree, expanding "any"
  // filters.
  const fieldFilters = Object.entries(filters)
    .filter(([, filter]) => filter.terms.length > 0)
    .map(([field, filter]) => {
      let termFilters;
      if (field === 'any') {
        const anyFields = ['quote', 'text', 'tag', 'user'];
        termFilters = filter.terms.map(
          term =>
            new BooleanOpFilter(
              'or',
              anyFields.map(field => makeTermFilter(field, term))
            )
        );
      } else {
        termFilters = filter.terms.map(term => makeTermFilter(field, term));
      }
      return new BooleanOpFilter(filter.operator, termFilters);
    });

  const rootFilter = new BooleanOpFilter('and', fieldFilters);

  return annotations
    .filter(ann => {
      return ann.id && rootFilter.matches(ann);
    })
    .map(ann => /** @type {string} */ (ann.id));
}
