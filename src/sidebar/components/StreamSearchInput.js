import { withServices } from '../service-context';
import { useSidebarStore } from '../store';
import SearchInput from './SearchInput';

/**
 * @typedef StreamSearchInputProps
 * @prop {import('../services/router').RouterService} router
 */

/**
 * Search input for the single annotation view and stream.
 *
 * This displays and updates the "q" query param in the URL.
 *
 * @param {StreamSearchInputProps} props
 */
function StreamSearchInput({ router }) {
  const store = useSidebarStore();
  const query = store.routeParams().q;
  /** @param {string} query */
  const setQuery = query => {
    // Re-route the user to `/stream` if they are on `/a/:id` and then set
    // the search query.
    router.navigate('stream', { q: query });
  };

  return (
    <SearchInput query={query} onSearch={setQuery} alwaysExpanded={true} />
  );
}

export default withServices(StreamSearchInput, ['router']);
