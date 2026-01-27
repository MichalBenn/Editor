using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MV.Common;
using MV.WorldObject;
using UnityEngine;

public class DeltaCubes
    {
        Queue<KeyValuePair<IntVector,CubeAction>> cubeChange = new Queue<KeyValuePair<IntVector, CubeAction>>();
        public Queue<KeyValuePair<IntVector, CubeAction>> CubeChange { get {return cubeChange; }
        }


        public int Count { get { return cubeChange.Count; } }

        public void Clear()
        {
            cubeChange.Clear();
        }

        public void GetChunksToRebuild(RuntimePrototypeCubeModel rpcm, ref HashSet<IntVector> chunkPositions)
        {
            foreach (KeyValuePair<IntVector, CubeAction> keyValuePair in cubeChange)
            {
                chunkPositions.Add(SharedCubeFunctions.CubePosToChunk(keyValuePair.Key, CubeModelChunk.ChunkSize));
            }
        }

        public DeltaCubes()
        {
            
        }
        public DeltaCubes(IEnumerable<KeyValuePair<IntVector, CubeAction>> cubeChangeOriginal)
        {
            foreach (KeyValuePair<IntVector, CubeAction> deltaCube in cubeChangeOriginal)
            {
                cubeChange.Enqueue(new KeyValuePair<IntVector, CubeAction>(deltaCube.Key, deltaCube.Value));
            }
        }

        public void Enqueue(IntVector iVector, CubeAction cubeAction)
        {
            cubeChange.Enqueue(new KeyValuePair<IntVector, CubeAction>(iVector, cubeAction));   
        }

        public byte[] Dequeue(RuntimePrototypeCubeModel rpcm)
        {
            KeyValuePair<IntVector, CubeAction> keyValuePair = cubeChange.Dequeue();
            BytePacker bp = new BytePacker();
            switch (keyValuePair.Value)
            {

                case CubeAction.Added:
                case CubeAction.FaceChanged:
                case CubeAction.CornersChangedDone:
                    bp.Write((byte)keyValuePair.Value);
                    byte[] byteCorners = rpcm.GetCube(keyValuePair.Key).ByteCorners;
                    byte[] materials = rpcm.GetCube(keyValuePair.Key).FaceMaterials;

                    CubeDataPacker.WriteCompressedCube(bp, keyValuePair.Key.x, keyValuePair.Key.y, keyValuePair.Key.z, byteCorners, materials);

                    return bp.ToArray();
                case CubeAction.CornersChanged:
                    break;
                case CubeAction.Deleted:
                    bp.Write((byte)keyValuePair.Value);
                    bp.Write(keyValuePair.Key.x);
                    bp.Write(keyValuePair.Key.y);
                    bp.Write(keyValuePair.Key.z);
                    return bp.ToArray();

            }

            return null;
        }

    public static HashSet<IntVector> DecodeBytePacker(BytePacker bp, RuntimePrototypeCubeModel rpcm)
    {
        HashSet<IntVector> cubePositions = new HashSet<IntVector>();
        while (bp.Position < bp.Length)
        {
            CubeAction cubeAction = (CubeAction) bp.ReadByte();
            IntVector iPos = new IntVector(bp.ReadInt16(), bp.ReadInt16(), bp.ReadInt16());

            cubePositions.Add(iPos);
            switch (cubeAction)
            {
                case CubeAction.Added:
                case CubeAction.CornersChangedDone:
                case CubeAction.FaceChanged:

                    rpcm.RemoveCubeNetworkUpdate(iPos);
                    rpcm.AddCubeNetworkUpdate(iPos, new Cube(bp, bp.ReadByte()));
                    break;
                case CubeAction.Deleted:

                    rpcm.RemoveCubeNetworkUpdate(iPos);

                    break;
            }
        }

        return cubePositions;
    } 
    }

