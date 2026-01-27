using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MV.Common;
using MV.WorldObject;
using UnityEngine;
using Object = UnityEngine.Object;
using Random = UnityEngine.Random;


public enum PrototypeState
{
    Registered,
    Pending
}

public class RuntimePrototypeCubeModel
{
    private ILogger logger = LoggerManager.Instance.GetLogger(typeof(RuntimePrototypeCubeModel));

    private PrototypeState prototypeState = PrototypeState.Pending;
    public PrototypeState PrototypeState
    {
        get { return prototypeState; }
        set
        {
            if (value == PrototypeState.Pending)
            {
                prototypeId = -1;
            }
            else if (value == PrototypeState.Registered)
            {
                if (prototypeId != -1)
                {
                    logger.Log("pendingDeltaCubes.Count " + pendingDeltaCubes.Count);

                    if (pendingDeltaCubes.Count > 0)
                    {

                        MVGameController.Instance.Game.UpdatePrototype(prototypeId, pendingDeltaCubes.ToArray());
                        pendingDeltaCubes.Clear();
                    }
                }
                else
                {
                    Debug.LogError("prototypeId is -1 which means that is it no yet assigned");
                }

            }
            prototypeState = value;
        }
    }

    private List<byte> pendingDeltaCubes = new List<byte>();

    private float scale;
    public float Scale { get { return scale; } }

    protected int prototypeId = -1;

    public int PrototypeId
    {
        get { return prototypeId; }
        set { prototypeId = value; }
    }

    private int mvItemId = -1;
    public int MVItemId
    {
        get { return mvItemId; }
    }

    protected string name;

    public string Name { get { return name; } }

    public int InstancesCount
    {
        get { return instances.Count; }
    }

    DeltaCubes deltaCubes = new DeltaCubes();

    public int DeltaCubesCount { get { return deltaCubes.Count; } }
    public DeltaCubes DeltaCubes { get { return deltaCubes; } }

    Dictionary<IntVector, CubeModelChunk> chunks = new Dictionary<IntVector, CubeModelChunk>();
    public Dictionary<IntVector, CubeModelChunk> Chunks { get { return chunks; } }
    HashSet<int> instances = new HashSet<int>();
    HashSet<IntVector> chunkPositionsBookkeeping = new HashSet<IntVector>();

    private RuntimePrototypeCubeModel()
    {
    }

    public RuntimePrototypeCubeModel(MVItem item)
    {
        if (MVGameController.Instance.WOCM.PlayerRepository.ItemTypes[item.itemTypeID] != "CubeModel")
        {
            Debug.LogError("Item is not a cubeModel");
        }
        MVPrototype prototype = new MVPrototype();
        prototype.ItemID = item.itemID;
        prototype.Scale = 1.0f;
        prototype.Name = item.name;
        prototype.ID = -1;
        prototype.Data = new Hashtable();
        prototype.Data.Add((byte)MVParameterKeys.PrototypeData, item.data);
        CreateFromPrototype(prototype);
    }

    public RuntimePrototypeCubeModel(MVPrototype prototype)
    {
        CreateFromPrototype(prototype);
        PrototypeState = PrototypeState.Registered;
        CreateMipMapMeshes();
    }

    public RuntimePrototypeCubeModel CloneGeometry(bool withDeltaCubes = false)
    {
        RuntimePrototypeCubeModel rpcm = new RuntimePrototypeCubeModel();
        rpcm.mvItemId = mvItemId;
        rpcm.scale = scale;
        rpcm.name = name;
        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            rpcm.chunks.Add(cubeModelChunk.Key, cubeModelChunk.Value.CloneGeometry(Vector3.one * scale));
        }

        if (withDeltaCubes) rpcm.deltaCubes = new DeltaCubes(deltaCubes.CubeChange);

        return rpcm;
    }

    void CreateFromPrototype(MVPrototype prototype)
    {
        mvItemId = prototype.ItemID;
        scale = prototype.Scale;
        prototypeId = prototype.ID;
        name = prototype.Name;
        BytePacker bp = new BytePacker((byte[])prototype.Data[(byte)MVParameterKeys.PrototypeData]);
        CreateFromBytePackage(bp);
        SetVisibility();
        RebuildPrototypeMesh();
    }

    public GameObject GetMesh()
    {
        GameObject go = new GameObject();

        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            GameObject chunkGo = new GameObject();
            MeshRenderer meshRenderer = chunkGo.AddComponent<MeshRenderer>();
            MeshFilter meshFilter =  chunkGo.AddComponent<MeshFilter>();
            meshFilter.sharedMesh = cubeModelChunk.Value.GetMeshData(MeshSetting.OriginalMesh).mesh;
            meshRenderer.sharedMaterials = cubeModelChunk.Value.GetMeshData(MeshSetting.OriginalMesh).materials;

            chunkGo.transform.parent = go.transform;
            chunkGo.transform.position = Vector3.zero;
            chunkGo.transform.rotation = Quaternion.identity;

        }

        return go;
    }
    public void CreateMipMapMeshes()
    {
        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            cubeModelChunk.Value.RebuildMipMapMesh(Vector3.one * scale);
        }
    }

    void SetVisibility()
    {
        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            cubeModelChunk.Value.SetCubeVisibility();
        }
    }

    public int GetCubeCount()
    {
        int count = 0;
        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            count += cubeModelChunk.Value.CubeCount;
        }
        return count;

    }

    public bool CubesLeft()
    {
        if (chunks.Count == 0)
        {
            return false;
        }
        return true;
    }

    public Vector3 GetRandomCubePos(GameObject go)
    {
        List<IntVector> keysChunks = chunks.Keys.ToList();
        return SharedCubeFunctions.LocalToWorld(go, chunks[keysChunks[Random.Range(0, keysChunks.Count)]].GetFirstSolidCubePos());
    }

    public Cube GetCube(IntVector cubePos)
    {
        CubeModelChunk chunk = GetChunkFromCubePos(cubePos);
        if (chunk == null)
        {
            return null;
        }
        return chunk.GetCube(cubePos);
    }
    public void AddCube(IntVector pos, Vector3[] corners, byte materialId = 0)
    {
        IntVector chunkPos = SharedCubeFunctions.CubePosToChunk(pos, CubeModelChunk.ChunkSize);
        if (chunks.ContainsKey(chunkPos) && chunks[chunkPos].ContainsCube(pos)) return;
        Cube cube = new Cube(CubeDataPacker.CornersToByteArray(corners), Cube.CreateMaterialArray(materialId));
        AddToChunk(pos, cube);
        deltaCubes.Enqueue(pos, CubeAction.Added);
    }
    public void UnIndentCubeFace(IntVector localPos, Face face, Cube cube)
    {
        if (cube != null)
        {
            Cube.UnIndentFace(cube, face);
            AddToChunk(localPos, cube);
            deltaCubes.Enqueue(localPos, CubeAction.CornersChangedDone);
        }

    }

    public void SetMaterial(IntVector iVector, Face face, byte materialId)
    {
        Cube cube = GetCube(iVector);
        if (cube == null) return;

        Cube.SetMaterial(cube, face, materialId);

        deltaCubes.Enqueue(iVector, CubeAction.FaceChanged);
    }

    public void ReplaceCube(IntVector iVector, byte materialId)
    {
        Cube cube = GetCube(iVector);
        if (cube == null) return;

        foreach (Face face in Enum.GetValues(typeof(Face)))
        {
            Cube.SetMaterial(cube, face, materialId);
        }
        deltaCubes.Enqueue(iVector, CubeAction.FaceChanged);
    }

    public void CornersChangedDone(IntVector iVector, Cube cube)
    {
        AddToChunk(iVector, cube);
        deltaCubes.Enqueue(iVector, CubeAction.CornersChangedDone);
    }

    public void CornersChanged(IntVector iVector, Cube cube)
    {
        AddToChunk(iVector, cube);
        deltaCubes.Enqueue(iVector, CubeAction.CornersChanged);
    }

    public void RemoveCube(IntVector iVector)
    {
        IntVector chunkPos = SharedCubeFunctions.CubePosToChunk(iVector, CubeModelChunk.ChunkSize);
        if (!chunks.ContainsKey(chunkPos))
        {
            return;
        }
        if (!chunks[chunkPos].ContainsCube(iVector)) return;
        RemoveFromChunk(iVector);
        deltaCubes.Enqueue(iVector, CubeAction.Deleted);
    }


    //Instancing management
    public void CreateInstance(MVCubeModelBase cm)
    {
        foreach (KeyValuePair<IntVector, GameObject> chunkInstance in cm.chunkInstances)
        {
            GameObject.Destroy(chunkInstance.Value);
        }
        cm.chunkInstances.Clear();

        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            SetInstanceDataRef(cubeModelChunk.Key, cm);
        }
        instances.Add(cm.Id);

    }

    public void RemoveInstance(int id)
    {
        instances.Remove(id);
    }

    public void ResetSharedMaterials(MVCubeModelInstance cm)
    {
        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            cm.GetChunkInstance(cubeModelChunk.Key).renderer.sharedMaterials =
                cubeModelChunk.Value.GetMeshData(MeshSetting.OriginalMesh).materials;
        }
    }


    public void RebuildChunks(HashSet<IntVector> chunks)
    {
        foreach (IntVector intVector in chunks)
        {
            RebuildChunk(intVector, scale * Vector3.one);
        }

    }

    //functions for handling network updates
    public void UpdatePrototype(BytePacker bp)
    {
        HashSet<IntVector> cubePositions = DeltaCubes.DecodeBytePacker(bp, this);

        HashSet<IntVector> chunksToRegenerate = new HashSet<IntVector>();//GetCubeAdjacentChunks(iPos);

        foreach (IntVector cubePosition in cubePositions)
        {
            chunksToRegenerate.Add(SharedCubeFunctions.CubePosToChunk(cubePosition, CubeModelChunk.ChunkSize));
        }
        //Maintain selection color if selected by other user
        //TODO: Selection visualization should be completely chunk independent
        foreach (int instance in instances)
        {
            MVWorldObjectClient wo = MVGameController.Instance.WOCM.GetWorldObjectClient(instance);
            if (wo.OwnerActorNr != 0 && wo.OwnerActorNr != MVGameController.Instance.WOCM.LocalPlayerActorNumber)
            {
                wo.Select(Color.blue);
            }
        }

        RebuildChunks(chunksToRegenerate);

    }

    public void UpdatePrototypeScale(float scale)
    {
        Debug.LogError("This must be reimplemented!");
    }

    public void AddCubeNetworkUpdate(IntVector iVector, Cube cube)
    {
        AddToChunk(iVector, cube);
    }
    public void RemoveCubeNetworkUpdate(IntVector iVector)
    {
        RemoveFromChunk(iVector);
    }

    public void HandleDelta()
    {
        chunkPositionsBookkeeping.Clear();
        deltaCubes.GetChunksToRebuild(this, ref chunkPositionsBookkeeping);
        RebuildChunks(chunkPositionsBookkeeping);

        while (deltaCubes.Count > 0)
        {
            Byte[] bytes = deltaCubes.Dequeue(this);
            if (bytes != null)
            {
                if (prototypeState == PrototypeState.Registered)
                {
                    MVGameController.Instance.Game.UpdatePrototype(prototypeId, bytes);
                }
                else if (prototypeState == PrototypeState.Pending)
                {
                    //Debug.Log("adding range " + bytes.Length);
                    pendingDeltaCubes.AddRange(bytes);
                }
            }

        }

    }

    void RebuildChunk(IntVector chunkPos, Vector3 scale)
    {
        if (chunks.ContainsKey(chunkPos))
        {
            CubeModelChunk cubeModelChunk = chunks[chunkPos];
            cubeModelChunk.RebuildChunk(scale);

        }

    }

    //Only called on initialization
    void RebuildPrototypeMesh()
    {
        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            cubeModelChunk.Value.RebuildChunk(Vector3.one * scale);
        }
    }

    //This is add and remove chunk for all instances
    void AddChunk(IntVector chunkPos)
    {

        foreach (int instance in instances)
        {
            SetInstanceDataRef(chunkPos, (MVCubeModelBase)MVGameController.Instance.WOCM.WorldObjects[instance]);
        }


    }
    void RemoveChunk(IntVector chunkPos)
    {
        foreach (int instance in instances)
        {
            MVCubeModelBase cubeModel = (MVCubeModelBase)MVGameController.Instance.WOCM.WorldObjects[instance];
            GameObject.Destroy(cubeModel.chunkInstances[chunkPos]);
            cubeModel.chunkInstances.Remove(chunkPos);
        }
    }

    void SetInstanceDataRef(IntVector chunkPos, MVCubeModelBase cubeInstance)
    {
        chunks[chunkPos].SetInstanceDataRef(chunkPos, cubeInstance);
    }



    void CreateFromBytePackage(BytePacker bp)
    {
        int cubesCount = bp.ReadInt32();


        logger.Log("Cube Count " + cubesCount);


        Cube originalCube;
        for (int i = 0; i < cubesCount; i++)
        {

            IntVector intVector = new IntVector(bp.ReadInt16(), bp.ReadInt16(), bp.ReadInt16());
            byte byteflags = bp.ReadByte();
            originalCube = new Cube(bp, byteflags);
            AddToChunk(intVector, originalCube, false);

            int clones = CubeDataPacker.GetCubesInRow(byteflags);

            for (int j = 1; j < clones; j++)
            {
                IntVector clonePos = intVector;
                clonePos.x += (short)j;
                AddToChunk(clonePos, Cube.Clone(originalCube), false);

            }

        }

    }
    void AddToChunk(IntVector iVector, Cube cube, bool setVisibility = true)
    {
        IntVector chunkPos = SharedCubeFunctions.CubePosToChunk(iVector, CubeModelChunk.ChunkSize);
        if (!chunks.ContainsKey(chunkPos))
        {
            CubeModelChunk chunk = new CubeModelChunk(chunkPos);
            chunks.Add(chunkPos, chunk);
            AddChunk(chunkPos);
        }
        chunks[chunkPos].AddToChunk(iVector, cube, setVisibility);
    }


    CubeModelChunk GetChunkFromCubePos(IntVector cubePos)
    {
        IntVector key = SharedCubeFunctions.CubePosToChunk(cubePos, CubeModelChunk.ChunkSize);

        CubeModelChunk cubeModelChunk;
        if (chunks.TryGetValue(key, out cubeModelChunk))
        {
            return cubeModelChunk;
        }

        return null;

    }

    void RemoveFromChunk(IntVector iVector)
    {
        IntVector chunkPos = SharedCubeFunctions.CubePosToChunk(iVector, CubeModelChunk.ChunkSize);
        if (!chunks.ContainsKey(chunkPos))
        {
            return;
        }

        chunks[chunkPos].RemoveFromChunk(iVector);
        if (chunks[chunkPos].CubeCount == 0)
        {
            Debug.Log("cube count is 0");
            chunks[chunkPos].Destroy();
            chunks.Remove(chunkPos);
            RemoveChunk(chunkPos);
        }



    }

    public static BytePacker GetBytePackerFromCubeDict(Dictionary<IntVector, Cube> cubesDict, bool addCount)
    {
        BytePacker bp = new BytePacker();
        if (addCount)
        {
            bp.Write(cubesDict.Count);
        }
        foreach (KeyValuePair<IntVector, Cube> keyValuePair in cubesDict)
        {
            CubeDataPacker.WriteCompressedCube(bp, keyValuePair.Key.x, keyValuePair.Key.y, keyValuePair.Key.z, keyValuePair.Value.ByteCorners, keyValuePair.Value.FaceMaterials);

        }
        return bp;
    }

    public void CubePosToChunkPos(ref IntVector cubePos)
    {
        IntVector chunkPos = SharedCubeFunctions.CubePosToChunk(cubePos, CubeModelChunk.ChunkSize);

        //Debug.Log("cubePos " + cubePos);
        //Debug.Log("chunkPos " + chunkPos);

        cubePos.x -= (short)(CubeModelChunk.ChunkSize * chunkPos.x);
        cubePos.y -= (short)(CubeModelChunk.ChunkSize * chunkPos.y);
        cubePos.z -= (short)(CubeModelChunk.ChunkSize * chunkPos.z);

        /*if(chunkPos.x> 0)
        {
            //Debug.Log("chunkPosX >");
            //Debug.Log("cubePosX" + cubePos.x);
            cubePos.x = (short)((chunkSize - 1) - cubePos.x);
        }
        if (chunkPos.y > 0)
        {
            cubePos.y = (short)((chunkSize - 1) - cubePos.y);
        }
        if (chunkPos.z > 0)
        {
            cubePos.z = (short)((chunkSize - 1) - cubePos.z);
        }*/


        //if(cubePos.x < 0 || cubePos.y < 0 || cubePos.z < 0) Debug.LogError("CubePosToChunkPos failed");

    }

    public bool CompareGeometry(RuntimePrototypeCubeModel rpcm)
    {
        if (GetCubeCount() != rpcm.GetCubeCount()) return false;

        foreach (KeyValuePair<IntVector, CubeModelChunk> cubeModelChunk in chunks)
        {
            if (!cubeModelChunk.Value.CompareGeometry(rpcm.chunks[cubeModelChunk.Key])) return false;
        }

        return true;
    }

}





