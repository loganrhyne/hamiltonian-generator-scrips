# hamiltonian-generator-scrips


This project is the software half of a design exercise to create a collection of lighting artifacts defined by Hamiltonian Cycles.

The initial exploration is to create a cardboard prototype of a cylindrical lampshade where the central illumination is surrounded by a Hamiltonian Cycle path that fills the surface plane of a cylindrical grid and then is projected inwards to create "walls" so the path has dimensionality perpendicular to the vertical axis of the cylinder.

On the software side we need:

- An algorithm to generate valid Hamiltonian cycles for "even" cylindrical grids
- A representation of paths that we can serialize and save
- A simple way to visualize generated paths to check for correctness
- A way to specify "physical" traits like wall thickess and height to visualize the final object as it would exist after construction


## Usage

```
python cycle_generator.py <width> <height> --json output.json --image cycle.png --flips 100 --seed 42
```

Both `width` and `height` must be even numbers. The script prints progress as the path is generated,
optionally applies random 2×2 "flips" to produce a less regular cycle and then saves the result to a
JSON file. If `matplotlib` is available a PNG visualisation is written, with edges that cross the
seam of the cylinder drawn separately on each side to show the wrap correctly.