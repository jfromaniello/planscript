units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Generated Plan" {
  footprint rect (0, 0) (18, 12)

  # circulation/full
  room hall {
    rect (5, 0) (6.5, 12)
    label "Hallway"
  }

  # public/full
  room living {
    rect (6.5, 4.35) (18, 12)
    label "Living Room"
  }
  room kitchen {
    rect (6.5, 0) (18, 4.35)
    label "Kitchen"
  }

  # private/full
  room master {
    rect (0, 8) (5, 12)
    label "Master Bedroom"
  }
  room bedroom2 {
    rect (0, 0) (5, 5.1)
    label "Bedroom 2"
  }
  room bath {
    rect (0, 5.1) (5, 8)
    label "Bathroom"
  }

  # Openings
  opening door d1 {
    between hall and living
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d2 {
    between hall and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d3 {
    between hall and master
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d4 {
    between hall and bedroom2
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d5 {
    between living and kitchen
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d6 {
    between bath and hall
    on shared_edge
    at 50%
    width 0.9
  }
  opening door d7 {
    on hall.edge south
    at 50%
    width 1
  }
  opening window w8 {
    on living.edge north
    at 50%
    width 2.25
  }
  opening window w9 {
    on master.edge north
    at 50%
    width 1.5
  }
  opening window w10 {
    on bedroom2.edge west
    at 50%
    width 1.5
  }
  opening window w11 {
    on bath.edge west
    at 50%
    width 0.75
  }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
}