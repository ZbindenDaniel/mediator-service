
# agentic runs can not be restarted when failed: 

[agentic-trigger] Agentic run start declined {
  context: 'item detail restart',
  artikelNummer: '019086',
  reason: 'already-exists'
}

# to many buttons when agentic runs are in the state 'review needed'  

in this state we display button 'abschliessen' as well as 'Freigeben'. They essentially do the same. Find a way to reduce them maybe replace the 'abschliessen' button with 'Freigeben' for all states.

# agentic runs never actually land in the state 'Geplant' it seems

Check if all the states are used. explain your findings

# LocationTag displays the same information twice for shelfs


# agentic transcript not visible after run

when a run is failed the transcript link is not displayed.

# log cluttering output: '[item-grouping] Falling back to non-canonical representative'

# activity links lead to dead endpoint

activities link to endpoints like '/items/019086'. we should allow to navigate to 'Artikelnummer' references. in this case we should navigate to the first instance of that item.

# unclean shelf UI

the layout for shelfs is unclean. cards are not aligned and there is empty space.
- enlarge the Behälter card to fill the entire width
- move the PrintLabelButton to the left below the detail-summary card so these two cards take the same space as the 'Regail-Details' card



# periodic backup to WebDAV

Let's add a shell script which can be run from a cronjob to periodically backup data to the webdav folder